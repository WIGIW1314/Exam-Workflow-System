import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import {
  DOMParser,
  XMLSerializer,
  type Document as XmlDocument,
  type Element as XmlElement,
  type Node as XmlNode,
} from '@xmldom/xmldom';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

type ParagraphAlignment = 'left' | 'center' | 'right';

export interface SignatureImagePayload {
  buffer: Buffer;
  extension: 'png';
}

export interface ParagraphRunSpec {
  text?: string;
}

export interface ParagraphSpec {
  runs?: ParagraphRunSpec[];
  text?: string;
  align?: ParagraphAlignment;
}

export interface EditableDocx {
  zip: JSZip;
  document: XmlDocument;
  relationships: XmlDocument;
  contentTypes: XmlDocument;
}

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function serializeXml(document: XmlDocument) {
  return new XMLSerializer().serializeToString(document);
}

function isElementNode(node: XmlNode | null): node is XmlElement {
  return Boolean(node && node.nodeType === 1);
}

function childElements(parent: XmlNode, localName?: string) {
  const result: XmlElement[] = [];
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const node = parent.childNodes[index];
    if (!isElementNode(node)) {
      continue;
    }
    if (!localName || node.localName === localName) {
      result.push(node);
    }
  }
  return result;
}

function descendants(parent: XmlDocument | XmlElement, localName: string, namespace = W_NS) {
  const nodes = parent.getElementsByTagNameNS(namespace, localName);
  const result: XmlElement[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node) {
      result.push(node);
    }
  }
  return result;
}

function firstChildElement(parent: XmlNode, localName: string) {
  return childElements(parent, localName)[0] ?? null;
}

function createWordElement(document: XmlDocument, localName: string) {
  return document.createElementNS(W_NS, `w:${localName}`);
}

function createRelationshipElement(document: XmlDocument, localName: string) {
  return document.createElementNS(REL_NS, localName);
}

function cloneNode<T extends XmlNode>(node: T | null) {
  return (node?.cloneNode(true) as T | null) ?? null;
}

function removeNode(node: XmlNode | null) {
  node?.parentNode?.removeChild(node);
}

function getOwnerDocument(node: XmlNode) {
  if (node.nodeType === 9) {
    return node as XmlDocument;
  }
  if (node.ownerDocument) {
    return node.ownerDocument;
  }
  throw new Error('DOCX 节点未绑定文档上下文');
}

function ensureParagraphProperties(paragraph: XmlElement) {
  let paragraphProperties = firstChildElement(paragraph, 'pPr');
  if (!paragraphProperties) {
    paragraphProperties = createWordElement(getOwnerDocument(paragraph), 'pPr');
    paragraph.insertBefore(paragraphProperties, paragraph.firstChild);
  }
  return paragraphProperties;
}

function setParagraphAlignment(paragraph: XmlElement, align?: ParagraphAlignment) {
  if (!align) {
    return;
  }
  const paragraphProperties = ensureParagraphProperties(paragraph);
  let jc = firstChildElement(paragraphProperties, 'jc');
  if (!jc) {
    jc = createWordElement(getOwnerDocument(paragraph), 'jc');
    paragraphProperties.appendChild(jc);
  }
  jc.setAttributeNS(W_NS, 'w:val', align);
}

function clearParagraphRuns(paragraph: XmlElement) {
  for (let index = paragraph.childNodes.length - 1; index >= 0; index -= 1) {
    const child = paragraph.childNodes[index];
    if (isElementNode(child) && child.localName !== 'pPr') {
      paragraph.removeChild(child);
    }
  }
}

function appendTextRun(paragraph: XmlElement, text: string, templateRunProperties: XmlElement | null) {
  const document = getOwnerDocument(paragraph);
  const run = createWordElement(document, 'r');
  if (templateRunProperties) {
    run.appendChild(templateRunProperties.cloneNode(true));
  }
  const textElement = createWordElement(document, 't');
  if (/^\s|\s$|\s{2,}/.test(text)) {
    textElement.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  }
  textElement.appendChild(document.createTextNode(text));
  run.appendChild(textElement);
  paragraph.appendChild(run);
}

function appendImageRun(
  paragraph: XmlElement,
  relationshipId: string,
  widthEmu: number,
  heightEmu: number,
  documentPropertyId: number,
) {
  const xml = `<w:r xmlns:w="${W_NS}" xmlns:r="${OFFICE_REL_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}">
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="${documentPropertyId}" name="Signature ${documentPropertyId}"/>
        <wp:cNvGraphicFramePr>
          <a:graphicFrameLocks noChangeAspect="1"/>
        </wp:cNvGraphicFramePr>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="signature.png"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${relationshipId}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${widthEmu}" cy="${heightEmu}"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>`;
  const tempDocument = parseXml(xml);
  const documentElement = tempDocument.documentElement;
  if (!documentElement) {
    throw new Error('签名图像 XML 片段创建失败');
  }
  paragraph.appendChild(documentElement.cloneNode(true));
}

function getRelationshipIds(document: XmlDocument) {
  const root = document.documentElement;
  if (!root) {
    return [];
  }
  return childElements(root, 'Relationship')
    .map((item) => item.getAttribute('Id') ?? '')
    .filter(Boolean);
}

function nextRelationshipId(document: XmlDocument) {
  const maxId = getRelationshipIds(document).reduce((current, value) => {
    const matched = Number(value.replace(/^rId/, ''));
    return Number.isNaN(matched) ? current : Math.max(current, matched);
  }, 0);
  return `rId${maxId + 1}`;
}

function nextDocumentPropertyId(document: XmlDocument) {
  return descendants(document, 'docPr', WP_NS).reduce((current, item) => {
    const value = Number(item.getAttribute('id') ?? '0');
    return Math.max(current, value);
  }, 0) + 1;
}

function ensureContentTypeDefault(document: XmlDocument, extension: string, contentType: string) {
  const root = document.documentElement;
  if (!root) {
    throw new Error('DOCX ContentTypes 结构异常');
  }
  const exists = childElements(root, 'Default').some(
    (item) => item.getAttribute('Extension') === extension,
  );
  if (exists) {
    return;
  }
  const node = document.createElement('Default');
  node.setAttribute('Extension', extension);
  node.setAttribute('ContentType', contentType);
  root.appendChild(node);
}

function readPngSize(buffer: Buffer) {
  if (buffer.length < 24) {
    return { width: 180, height: 60 };
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return {
    width: width || 180,
    height: height || 60,
  };
}

function toEmu(pixel: number) {
  return Math.round(pixel * 9525);
}

function createSignatureImage(
  editableDocx: EditableDocx,
  image: SignatureImagePayload,
  preferredWidth = 112,
  preferredHeight = 36,
) {
  const relationshipId = nextRelationshipId(editableDocx.relationships);
  const mediaName = `signature-${Date.now()}-${Math.random().toString(16).slice(2)}.${image.extension}`;
  editableDocx.zip.file(`word/media/${mediaName}`, image.buffer);
  ensureContentTypeDefault(editableDocx.contentTypes, image.extension, 'image/png');

  const relationship = createRelationshipElement(editableDocx.relationships, 'Relationship');
  relationship.setAttribute('Id', relationshipId);
  relationship.setAttribute('Type', `${OFFICE_REL_NS}/image`);
  relationship.setAttribute('Target', `media/${mediaName}`);
  const relationshipsRoot = editableDocx.relationships.documentElement;
  if (!relationshipsRoot) {
    throw new Error('DOCX 关系文档结构异常');
  }
  relationshipsRoot.appendChild(relationship);

  const size = readPngSize(image.buffer);
  const scale = Math.min(preferredWidth / size.width, preferredHeight / size.height, 1);
  const width = Math.max(60, Math.round(size.width * scale));
  const height = Math.max(18, Math.round(size.height * scale));

  return {
    relationshipId,
    widthEmu: toEmu(width),
    heightEmu: toEmu(height),
    documentPropertyId: nextDocumentPropertyId(editableDocx.document),
  };
}

export async function loadEditableDocx(templatePath: string) {
  const buffer = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  const relationshipsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  const contentTypesXml = await zip.file('[Content_Types].xml')?.async('string');

  if (!documentXml || !relationshipsXml || !contentTypesXml) {
    throw new Error(`DOCX 模板结构不完整：${path.basename(templatePath)}`);
  }

  return {
    zip,
    document: parseXml(documentXml),
    relationships: parseXml(relationshipsXml),
    contentTypes: parseXml(contentTypesXml),
  } satisfies EditableDocx;
}

export async function saveEditableDocx(editableDocx: EditableDocx) {
  editableDocx.zip.file('word/document.xml', serializeXml(editableDocx.document));
  editableDocx.zip.file('word/_rels/document.xml.rels', serializeXml(editableDocx.relationships));
  editableDocx.zip.file('[Content_Types].xml', serializeXml(editableDocx.contentTypes));
  return editableDocx.zip.generateAsync({ type: 'nodebuffer' });
}

export function getBodyParagraphs(document: XmlDocument) {
  const body = descendants(document, 'body')[0];
  return body ? childElements(body, 'p') : [];
}

export function getTables(document: XmlDocument) {
  const body = descendants(document, 'body')[0];
  return body ? childElements(body, 'tbl') : [];
}

export function getRows(table: XmlElement) {
  return childElements(table, 'tr');
}

export function getCells(row: XmlElement) {
  return childElements(row, 'tc');
}

export function ensureCellParagraph(cell: XmlElement) {
  const paragraph = childElements(cell, 'p')[0];
  if (paragraph) {
    return paragraph;
  }
  const nextParagraph = createWordElement(getOwnerDocument(cell), 'p');
  cell.appendChild(nextParagraph);
  return nextParagraph;
}

export function setCellParagraphs(cell: XmlElement, paragraphs: ParagraphSpec[]) {
  const templateParagraph = ensureCellParagraph(cell);
  const templateRunProperties = cloneNode(descendants(templateParagraph, 'rPr')[0] ?? null);
  const templateParagraphProperties = cloneNode(firstChildElement(templateParagraph, 'pPr'));

  for (let index = cell.childNodes.length - 1; index >= 0; index -= 1) {
    const child = cell.childNodes[index];
    if (isElementNode(child) && child.localName !== 'tcPr') {
      cell.removeChild(child);
    }
  }

  const paragraphSpecs = paragraphs.length ? paragraphs : [{ text: '' }];
  paragraphSpecs.forEach((paragraphSpec) => {
    const paragraph = templateParagraph.cloneNode(true) as XmlElement;
    clearParagraphRuns(paragraph);
    const currentParagraphProperties = firstChildElement(paragraph, 'pPr');
    if (!currentParagraphProperties && templateParagraphProperties) {
      paragraph.insertBefore(templateParagraphProperties.cloneNode(true), paragraph.firstChild);
    }
    setParagraphAlignment(paragraph, paragraphSpec.align);

    const runs = paragraphSpec.runs ?? [{ text: paragraphSpec.text ?? '' }];
    runs.forEach((runSpec) => {
      if (runSpec.text !== undefined) {
        appendTextRun(paragraph, runSpec.text, templateRunProperties);
      }
    });

    cell.appendChild(paragraph);
  });
}

export function setParagraphText(paragraph: XmlElement, text: string) {
  const runProperties = cloneNode(descendants(paragraph, 'rPr')[0] ?? null);
  clearParagraphRuns(paragraph);
  appendTextRun(paragraph, text, runProperties);
}

export function setTableCellText(table: XmlElement, rowIndex: number, cellIndex: number, value: string) {
  const row = getRows(table)[rowIndex];
  const cell = row ? getCells(row)[cellIndex] : null;
  if (!cell) {
    throw new Error(`DOCX 模板行列不存在：row=${rowIndex} cell=${cellIndex}`);
  }
  setCellParagraphs(cell, [{ text: value }]);
}

export function fillRepeatingRows<T>(
  table: XmlElement,
  rowIndex: number,
  placeholderCount: number,
  items: T[],
  fillRow: (row: XmlElement, item: T, itemIndex: number) => void,
) {
  const rows = getRows(table);
  const baseRow = rows[rowIndex];
  if (!baseRow) {
    throw new Error(`无法定位模板重复行：row=${rowIndex}`);
  }
  const anchor = rows[rowIndex + placeholderCount] ?? null;
  for (let index = 1; index < placeholderCount; index += 1) {
    removeNode(rows[rowIndex + index] ?? null);
  }

  const nextItems = items.length ? items : [undefined as T];
  fillRow(baseRow, nextItems[0], 0);

  for (let index = 1; index < nextItems.length; index += 1) {
    const row = baseRow.cloneNode(true) as XmlElement;
    if (anchor) {
      table.insertBefore(row, anchor);
    } else {
      table.appendChild(row);
    }
    fillRow(row, nextItems[index], index);
  }
}

export function ensureRowCellCount(row: XmlElement, desiredCount: number) {
  const cells = getCells(row);
  if (!cells.length) {
    return getCells(row);
  }
  while (cells.length < desiredCount) {
    const clone = cells[cells.length - 1].cloneNode(true) as XmlElement;
    row.appendChild(clone);
    cells.push(clone);
  }
  return cells;
}

export function ensureTableGridColumns(table: XmlElement, desiredCount: number) {
  const tableGrid = firstChildElement(table, 'tblGrid');
  if (!tableGrid) {
    return;
  }
  const columns = childElements(tableGrid, 'gridCol');
  if (!columns.length) {
    return;
  }
  while (columns.length < desiredCount) {
    const clone = columns[columns.length - 1].cloneNode(true) as XmlElement;
    tableGrid.appendChild(clone);
    columns.push(clone);
  }
}

export function setCellParagraphsWithSignature(
  editableDocx: EditableDocx,
  cell: XmlElement,
  paragraphs: Array<{
    align?: ParagraphAlignment;
    prefix?: string;
    signerName?: string;
    signatureImage?: SignatureImagePayload | null;
    suffix?: string;
    text?: string;
  }>,
) {
  const templateParagraph = ensureCellParagraph(cell);
  const templateRunProperties = cloneNode(descendants(templateParagraph, 'rPr')[0] ?? null);
  const templateParagraphProperties = cloneNode(firstChildElement(templateParagraph, 'pPr'));

  for (let index = cell.childNodes.length - 1; index >= 0; index -= 1) {
    const child = cell.childNodes[index];
    if (isElementNode(child) && child.localName !== 'tcPr') {
      cell.removeChild(child);
    }
  }

  paragraphs.forEach((paragraphSpec) => {
    const paragraph = templateParagraph.cloneNode(true) as XmlElement;
    clearParagraphRuns(paragraph);
    const currentParagraphProperties = firstChildElement(paragraph, 'pPr');
    if (!currentParagraphProperties && templateParagraphProperties) {
      paragraph.insertBefore(templateParagraphProperties.cloneNode(true), paragraph.firstChild);
    }
    setParagraphAlignment(paragraph, paragraphSpec.align);

    if (paragraphSpec.text !== undefined) {
      appendTextRun(paragraph, paragraphSpec.text, templateRunProperties);
      cell.appendChild(paragraph);
      return;
    }

    if (paragraphSpec.prefix) {
      appendTextRun(paragraph, paragraphSpec.prefix, templateRunProperties);
    }
    if (paragraphSpec.signatureImage) {
      const signatureImage = createSignatureImage(editableDocx, paragraphSpec.signatureImage);
      appendImageRun(
        paragraph,
        signatureImage.relationshipId,
        signatureImage.widthEmu,
        signatureImage.heightEmu,
        signatureImage.documentPropertyId,
      );
    } else if (paragraphSpec.signerName) {
      appendTextRun(paragraph, paragraphSpec.signerName, templateRunProperties);
    }
    if (paragraphSpec.suffix) {
      appendTextRun(paragraph, paragraphSpec.suffix, templateRunProperties);
    }

    cell.appendChild(paragraph);
  });
}

export function getCell(table: XmlElement, rowIndex: number, cellIndex: number) {
  const row = getRows(table)[rowIndex];
  const cell = row ? getCells(row)[cellIndex] : null;
  if (!cell) {
    throw new Error(`DOCX 模板单元格不存在：row=${rowIndex} cell=${cellIndex}`);
  }
  return cell;
}

export function formatDocDate(dateValue?: string | null) {
  if (!dateValue) {
    return '';
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }
  return `${date.getFullYear()} 年 ${String(date.getMonth() + 1).padStart(2, '0')} 月 ${String(date.getDate()).padStart(2, '0')} 日`;
}

export function formatCheckboxLine(options: Array<{ label: string; value: string }>, selectedValue?: string | null) {
  return options
    .map((option) => `（${selectedValue === option.value ? '√' : ' '}）${option.label}`)
    .join('    ');
}

export function formatMultiCheckboxLine(options: Array<{ label: string; value: string }>, selectedValues?: string[]) {
  const valueSet = new Set(selectedValues ?? []);
  return options
    .map((option) => `（${valueSet.has(option.value) ? '√' : ' '}）${option.label}`)
    .join('    ');
}

export function formatSquareCheckboxLine(options: Array<{ label: string; value: string }>, selectedValue?: string | null) {
  return options
    .map((option) => `${option.label} ${selectedValue === option.value ? '☑' : '□'}`)
    .join('     ');
}

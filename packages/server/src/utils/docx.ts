import fs from 'node:fs/promises';
import JSZip from 'jszip';

const headerFileName = 'word/header-paper-number.xml';
const headerRelId = 'rIdPaperNumberHeader';

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildHeaderXml(paperNumber: string) {
  const text = escapeXml(`试卷编号：${paperNumber}`);
  const boxTopOffset = 30;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <w:p>
    <w:pPr>
      <w:jc w:val="right"/>
    </w:pPr>
    <w:r>
      <w:pict>
        <v:rect id="PaperNumberBox" o:spid="_x0000_s1025" strokecolor="#000000" fillcolor="#ffffff" style="position:absolute;margin-left:0;margin-top:${boxTopOffset}pt;width:180pt;height:24pt;z-index:251659264;mso-position-horizontal:right;mso-position-horizontal-relative:margin;mso-position-vertical:absolute;mso-position-vertical-relative:page;">
          <v:textbox inset="3pt,2pt,3pt,2pt">
            <w:txbxContent>
              <w:p>
                <w:pPr>
                  <w:jc w:val="center"/>
                </w:pPr>
                <w:r>
                  <w:rPr>
                    <w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="宋体"/>
                    <w:sz w:val="24"/>
                    <w:szCs w:val="24"/>
                  </w:rPr>
                  <w:t>${text}</w:t>
                </w:r>
              </w:p>
            </w:txbxContent>
          </v:textbox>
        </v:rect>
      </w:pict>
    </w:r>
  </w:p>
</w:hdr>`;
}

function ensureRelationship(xml: string) {
  if (xml.includes(`Id="${headerRelId}"`)) {
    return xml.replace(
      new RegExp(`<Relationship Id="${headerRelId}"[^>]*/>`),
      `<Relationship Id="${headerRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header-paper-number.xml"/>`,
    );
  }

  return xml.replace(
    '</Relationships>',
    `  <Relationship Id="${headerRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header-paper-number.xml"/></Relationships>`,
  );
}

function ensureContentType(xml: string) {
  if (xml.includes('/word/header-paper-number.xml')) {
    return xml;
  }

  return xml.replace(
    '</Types>',
    `<Override PartName="/word/header-paper-number.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`,
  );
}

function ensureHeaderReference(xml: string) {
  const relation = `<w:headerReference w:type="default" r:id="${headerRelId}"/>`;
  if (xml.includes(headerRelId)) {
    return xml;
  }

  return xml.replace(/<w:sectPr([^>]*)>/g, (match) => `${match}${relation}`);
}

export async function injectPaperNumber(inputPath: string, outputPath: string, paperNumber: string) {
  const buffer = await fs.readFile(inputPath);
  const zip = await JSZip.loadAsync(buffer);

  const documentXml = await zip.file('word/document.xml')?.async('string');
  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  const contentTypesXml = await zip.file('[Content_Types].xml')?.async('string');

  if (!documentXml || !relsXml || !contentTypesXml) {
    throw new Error('DOCX 文件结构不完整，无法注入编号');
  }

  zip.file('word/document.xml', ensureHeaderReference(documentXml));
  zip.file('word/_rels/document.xml.rels', ensureRelationship(relsXml));
  zip.file('[Content_Types].xml', ensureContentType(contentTypesXml));
  zip.file(headerFileName, buildHeaderXml(paperNumber));

  const result = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(outputPath, result);
}

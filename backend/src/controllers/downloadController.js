const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');
const Story = require('../models/Story');

// Strip HTML → readable plain text preserving paragraph breaks
const htmlToPlain = (html) =>
  (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '\n• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Safe filename from story title
const safeFilename = (title) =>
  (title || 'story').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 80);

// GET /api/download/:id?format=pdf|docx|txt
exports.downloadStory = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'txt' } = req.query;

    if (!['pdf', 'docx', 'txt'].includes(format)) {
      return res.status(400).json({ message: 'Invalid format. Use pdf, docx, or txt.' });
    }

    // Access enforced — user can only download stories they own or collaborate on
    const story = await Story.findOne({
      _id: id,
      $or: [
        { owner: req.user._id },
        { collaborators: req.user._id }
      ]
    });
    if (!story) return res.status(404).json({ message: 'Story not found' });

    const plainContent = htmlToPlain(story.content || 'No content yet.');
    const genreStr     = story.genres?.length ? story.genres.join(', ') : 'None';
    const createdStr   = new Date(story.createdAt).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
    const updatedStr   = new Date(story.updatedAt).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
    const filename     = safeFilename(story.title);

    // ── TXT ──────────────────────────────────────────────────
    if (format === 'txt') {
      const divider = '─'.repeat(60);
      const content = [
        story.title,
        '═'.repeat(story.title.length),
        '',
        `Genres:       ${genreStr}`,
        `Created:      ${createdStr}`,
        `Last Updated: ${updatedStr}`,
        '',
        divider,
        '',
        plainContent,
      ].join('\n');

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
      return res.send(content);
    }

    // ── PDF ──────────────────────────────────────────────────
    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 72, size: 'A4', info: { Title: story.title, Author: 'Co-Author AI' } });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      doc.pipe(res);

      // Title block
      doc.font('Helvetica-Bold').fontSize(26).fillColor('#1a1d23').text(story.title, { align: 'center' });
      doc.moveDown(0.4);

      // Metadata line
      doc.font('Helvetica').fontSize(10).fillColor('#8a95a3')
        .text(`Genres: ${genreStr}   ·   Created: ${createdStr}   ·   Updated: ${updatedStr}`, { align: 'center' });
      doc.moveDown(0.8);

      // Horizontal rule
      const margin = 72;
      doc.moveTo(margin, doc.y).lineTo(doc.page.width - margin, doc.y)
        .strokeColor('#d8dce4').lineWidth(0.5).stroke();
      doc.moveDown(1);

      // Body text
      doc.font('Helvetica').fontSize(12).fillColor('#1a1d23');
      const paragraphs = plainContent.split('\n\n').filter(Boolean);
      paragraphs.forEach((p, i) => {
        if (i > 0) doc.moveDown(0.6);
        doc.text(p.trim(), { align: 'justify', lineGap: 3 });
      });

      // Footer on each page
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(9).fillColor('#8a95a3')
          .text(`Co-Author AI  ·  ${story.title}`, margin, doc.page.height - 40, { align: 'left', width: doc.page.width - margin * 2 })
          .text(`Page ${i + 1} of ${totalPages}`, margin, doc.page.height - 40, { align: 'right', width: doc.page.width - margin * 2 });
      }

      doc.end();
      return;
    }

    // ── DOCX ─────────────────────────────────────────────────
    if (format === 'docx') {
      const contentParagraphs = plainContent.split('\n\n').filter(Boolean).map(p =>
        new Paragraph({
          children: [new TextRun({ text: p.trim(), size: 24, font: 'Calibri' })],
          spacing: { before: 120, after: 120, line: 300 },
          alignment: AlignmentType.JUSTIFIED,
        })
      );

      const docx = new Document({
        sections: [{
          properties: { page: { margin: { top: 1440, right: 1134, bottom: 1134, left: 1134 } } },
          children: [
            // Story title
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 160 },
              children: [new TextRun({ text: story.title, bold: true, size: 52, font: 'Calibri', color: '1a1d23' })],
            }),
            // Metadata
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 40 },
              children: [new TextRun({ text: `Genres: ${genreStr}`, size: 20, font: 'Calibri', color: '8a95a3' })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 320 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'd8dce4', space: 12 } },
              children: [new TextRun({ text: `Created: ${createdStr}  ·  Updated: ${updatedStr}`, size: 18, font: 'Calibri', color: '8a95a3' })],
            }),
            // Content
            ...contentParagraphs,
          ],
        }],
      });

      const buf = await Packer.toBuffer(docx);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.docx"`);
      res.setHeader('Content-Length', buf.length);
      return res.send(buf);
    }

  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ message: 'Failed to generate file. Please try again.' });
  }
};

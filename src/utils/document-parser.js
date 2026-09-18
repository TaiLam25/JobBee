const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

const MAX_TEXT_LENGTH = 100000; // Cap at 100k chars for AI/processing safety

/**
 * Extract plain text from PDF, DOCX, or TXT buffer
 */
async function extractTextFromBuffer(fileBuffer, mimeType = '', originalName = '') {
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
        return '';
    }

    const ext = (originalName || '').toLowerCase().split('.').pop();
    const mime = (mimeType || '').toLowerCase();
    
    // Auto-detect PDF via header %PDF or mime / extension
    const isPdf = mime.includes('pdf') || ext === 'pdf' || (fileBuffer.length > 4 && fileBuffer.slice(0, 4).toString() === '%PDF');
    
    // Auto-detect DOCX via header PK (0x50 0x4B) or mime / extension
    const isDocx = mime.includes('word') || mime.includes('officedocument') || ext === 'docx' || ext === 'doc' || (fileBuffer.length > 2 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B);

    let text = '';

    try {
        if (isPdf) {
            const parser = new PDFParse({ data: fileBuffer });
            const result = await parser.getText();
            await parser.destroy().catch(() => {});
            text = (result.text || '').trim();
        } else if (isDocx) {
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            text = (result.value || '').trim();
        } else {
            // Default to plain text
            text = fileBuffer.toString('utf-8').trim();
        }
    } catch (err) {
        console.warn('Document parse primary attempt failed:', err.message);
        try {
            if (isDocx) {
                const result = await mammoth.extractRawText({ buffer: fileBuffer });
                text = (result.value || '').trim();
            }
        } catch (subErr) {}
        
        if (!text) {
            // Fallback to sanitized UTF-8 extraction
            text = fileBuffer.toString('utf-8').replace(/[^\x20-\x7E\s\u00C0-\u1EF9]/g, ' ').trim();
        }
    }

    if (text.length > MAX_TEXT_LENGTH) {
        text = text.substring(0, MAX_TEXT_LENGTH);
    }

    return text;
}

module.exports = {
    extractTextFromBuffer,
};

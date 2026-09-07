const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const MAX_TEXT_LENGTH = 100000; // Cap at 100k chars for AI/processing safety

/**
 * Extract plain text from PDF, DOCX, or TXT buffer
 */
async function extractTextFromBuffer(fileBuffer, mimeType, originalName = '') {
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
        return '';
    }

    const ext = (originalName || '').toLowerCase().split('.').pop();
    let text = '';

    try {
        if (mimeType === 'application/pdf' || ext === 'pdf') {
            const data = await pdfParse(fileBuffer, { max: 20 }); // Limit to max 20 pages
            text = (data.text || '').trim();
        } else if (
            mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mimeType === 'application/msword' ||
            ext === 'docx' ||
            ext === 'doc'
        ) {
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            text = (result.value || '').trim();
        } else {
            // Default to plain text
            text = fileBuffer.toString('utf-8').trim();
        }
    } catch (err) {
        // Fallback to sanitized ASCII/UTF-8 extraction
        text = fileBuffer.toString('utf-8').replace(/[^\x20-\x7E\s]/g, ' ').trim();
    }

    if (text.length > MAX_TEXT_LENGTH) {
        text = text.substring(0, MAX_TEXT_LENGTH);
    }

    return text;
}

module.exports = {
    extractTextFromBuffer,
};

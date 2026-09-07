const multer = require('multer');
const AppError = require('../utils/app-error');

const storage = multer.memoryStorage();

// File filter for CV documents (PDF, DOCX, DOC, max 5MB)
const cvFilter = (req, file, cb) => {
    const allowedMimes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/octet-stream',
    ];
    const allowedExts = /\.(pdf|docx|doc)$/i;
    const hasValidExt = Boolean(file.originalname && file.originalname.match(allowedExts));
    const hasValidMime = allowedMimes.includes(file.mimetype);

    if (hasValidExt && hasValidMime) {
        cb(null, true);
    } else {
        cb(new AppError(400, 'Tệp CV chỉ chấp nhận định dạng PDF hoặc Word (.docx, .doc)'), false);
    }
};

// File filter for Images (JPEG, PNG, WEBP, max 2MB)
const imageFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedExts = /\.(jpg|jpeg|png|webp)$/i;
    const hasValidExt = Boolean(file.originalname && file.originalname.match(allowedExts));
    const hasValidMime = allowedMimes.includes(file.mimetype);

    if (hasValidExt && hasValidMime) {
        cb(null, true);
    } else {
        cb(new AppError(400, 'Hình ảnh chỉ chấp nhận định dạng JPG, PNG hoặc WEBP'), false);
    }
};

// File filter for Verification documents (PDF, DOCX, DOC, JPG, PNG, WEBP, max 10MB)
const docFilter = (req, file, cb) => {
    const allowedMimes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/octet-stream',
    ];
    const allowedExts = /\.(pdf|docx|doc|jpg|jpeg|png|webp)$/i;
    const hasValidExt = Boolean(file.originalname && file.originalname.match(allowedExts));
    const hasValidMime = allowedMimes.includes(file.mimetype);

    if (hasValidExt && hasValidMime) {
        cb(null, true);
    } else {
        cb(new AppError(400, 'Tài liệu xác minh chỉ chấp nhận định dạng tệp PDF, Word (.docx, .doc) hoặc ảnh (.jpg, .png, .webp)'), false);
    }
};

const uploadCV = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: cvFilter,
});

const uploadImage = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: imageFilter,
});

const uploadDocument = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: docFilter,
});

module.exports = {
    uploadCV,
    uploadImage,
    uploadDocument,
};

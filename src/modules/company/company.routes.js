const express = require('express');
const companyController = require('./company.controller');
const { authenticateToken, authorizeRoles } = require('../../middlewares/auth.middleware');
const { uploadImage, uploadDocument } = require('../../middlewares/upload.middleware');

const router = express.Router();

const empAuth = [authenticateToken, authorizeRoles('employer')];

const uploadCompanyImages = uploadImage.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'company_image', maxCount: 1 }
]);

router.get('/companies/me', empAuth, companyController.getMyCompany);
router.put('/companies/me', empAuth, uploadCompanyImages, companyController.updateMyCompany);
router.post('/companies/me/verification', empAuth, uploadDocument.single('document'), companyController.submitVerification);

// Alias routes for /employers/me
router.get('/employers/me', empAuth, companyController.getMyCompany);
router.put('/employers/me', empAuth, uploadCompanyImages, companyController.updateMyCompany);
router.post('/employers/me/verification', empAuth, uploadDocument.single('document'), companyController.submitVerification);

module.exports = router;

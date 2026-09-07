const express = require('express');
const adminController = require('./admin.controller');
const { authenticateToken, authorizeRoles } = require('../../middlewares/auth.middleware');

const router = express.Router();

const adminAuth = [authenticateToken, authorizeRoles('admin')];

router.get('/admin/companies/pending', adminAuth, adminController.getPendingEmployers);
router.get('/admin/companies', adminAuth, adminController.getEmployers);
router.get('/admin/companies/:id', adminAuth, adminController.getEmployerById);
router.get('/admin/companies/:id/verification-document-url', adminAuth, adminController.getVerificationDocSignedUrl);
router.put('/admin/companies/:id/verify', adminAuth, adminController.verifyEmployer);

router.get('/admin/jobs/pending', adminAuth, adminController.getPendingJobs);
router.put('/admin/jobs/:id/moderate', adminAuth, adminController.moderateJob);

router.get('/admin/accounts', adminAuth, adminController.getAccounts);
router.put('/admin/accounts/:id/lock', adminAuth, adminController.toggleLockAccount);

router.get('/admin/statistics', adminAuth, adminController.getStatistics);
router.get('/admin/analytics', adminAuth, adminController.getAdminAnalytics);

module.exports = router;


const express = require('express');
const reviewController = require('./review.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/small-jobs/registrations/:id/reviews', authenticateToken, reviewController.submitReview);
router.get('/reviews/me', authenticateToken, reviewController.getMyReviews);
router.get('/reviews/account/:accountId/rating', reviewController.getAccountRating);
router.get('/reviews/account/:accountId', reviewController.getAccountReviews);

module.exports = router;

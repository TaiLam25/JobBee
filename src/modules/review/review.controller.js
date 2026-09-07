const reviewService = require('./review.service');
const { sendResponse } = require('../../utils/response');

const submitReview = async (req, res, next) => {
    try {
        const review = await reviewService.submitReview(req.user.id, req.params.id, req.body);
        return sendResponse(res, 201, 'Gửi đánh giá thành công', review);
    } catch (error) {
        next(error);
    }
};

const getMyReviews = async (req, res, next) => {
    try {
        const reviews = await reviewService.getReviewsByAccount(req.user.id);
        return sendResponse(res, 200, 'Lấy danh sách đánh giá của bạn thành công', reviews);
    } catch (error) {
        next(error);
    }
};

const getAccountReviews = async (req, res, next) => {
    try {
        const reviews = await reviewService.getReviewsByAccount(req.params.accountId);
        return sendResponse(res, 200, 'Lấy danh sách đánh giá của tài khoản thành công', reviews);
    } catch (error) {
        next(error);
    }
};

const getAccountRating = async (req, res, next) => {
    try {
        const rating = await reviewService.getAccountRating(req.params.accountId);
        return sendResponse(res, 200, 'Lấy điểm đánh giá trung bình thành công', rating);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    submitReview,
    getMyReviews,
    getAccountReviews,
    getAccountRating,
};

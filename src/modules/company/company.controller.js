const companyService = require('./company.service');
const { sendResponse } = require('../../utils/response');

const getMyCompany = async (req, res, next) => {
    try {
        const company = await companyService.getMyCompany(req.user.id);
        return sendResponse(res, 200, 'Lấy thông tin doanh nghiệp thành công', company);
    } catch (error) {
        next(error);
    }
};

const updateMyCompany = async (req, res, next) => {
    try {
        const updated = await companyService.updateMyCompany(req.user.id, req.body, req.files, req.file);
        return sendResponse(res, 200, 'Cập nhật thông tin doanh nghiệp thành công', updated);
    } catch (error) {
        next(error);
    }
};

const submitVerification = async (req, res, next) => {
    try {
        const result = await companyService.submitVerification(req.user.id, req.file, req.body);
        return sendResponse(res, 200, 'Gửi tài liệu xác minh thành công, vui lòng chờ quản trị viên duyệt', result);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getMyCompany,
    updateMyCompany,
    submitVerification,
};

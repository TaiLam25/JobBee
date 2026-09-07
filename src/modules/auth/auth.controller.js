const authService = require('./auth.service');
const authModel = require('./auth.model');
const { sendResponse } = require('../../utils/response');

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const CLEAR_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
};

const register = async (req, res, next) => {
    try {
        const { account, tokens } = await authService.register(req.body);
        res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS);
        return sendResponse(res, 201, 'Đăng ký tài khoản thành công', {
            account,
            accessToken: tokens.accessToken,
        });
    } catch (error) {
        next(error);
    }
};

const login = async (req, res, next) => {
    const t1_start = performance.now();
    try {
        const { account, tokens, timings } = await authService.login(req.body);
        res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS);
        const total_request_time = performance.now() - t1_start;

        const perfSummary = {
            total_request_time: Number(total_request_time.toFixed(2)),
            db_find_account: Number((timings?.db_find_account || 0).toFixed(2)),
            bcrypt_compare: Number((timings?.bcrypt_compare || 0).toFixed(2)),
            jwt_sign: Number((timings?.jwt_sign || 0).toFixed(2)),
            db_update_refresh_token: Number((timings?.db_update_refresh_token || 0).toFixed(2)),
            db_enrich_account: Number((timings?.db_enrich_account || 0).toFixed(2)),
        };

        console.log('[PERF_LOGIN]', JSON.stringify(perfSummary));

        return sendResponse(res, 200, 'Đăng nhập thành công', {
            account,
            accessToken: tokens.accessToken,
            _perf: perfSummary,
        });
    } catch (error) {
        next(error);
    }
};

const logout = async (req, res, next) => {
    try {
        if (req.user) {
            await authService.logout(req.user.id);
        }
        res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
        return sendResponse(res, 200, 'Đăng xuất thành công');
    } catch (error) {
        next(error);
    }
};

const refreshToken = async (req, res, next) => {
    try {
        const tokenFromCookie = req.cookies?.refreshToken;
        const tokens = await authService.refreshAccessToken(tokenFromCookie);
        res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS);
        return sendResponse(res, 200, 'Làm mới token thành công', {
            accessToken: tokens.accessToken,
        });
    } catch (error) {
        next(error);
    }
};

const forgotPassword = async (req, res, next) => {
    try {
        return sendResponse(res, 200, 'Yêu cầu khôi phục mật khẩu đã được gửi tới email của bạn');
    } catch (error) {
        next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        return sendResponse(res, 200, 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.');
    } catch (error) {
        next(error);
    }
};

const getMe = async (req, res, next) => {
    try {
        const account = await authModel.findById(req.user.id);
        return sendResponse(res, 200, 'Lấy thông tin tài khoản thành công', account);
    } catch (error) {
        next(error);
    }
};

const updateMe = async (req, res, next) => {
    try {
        const updated = await authModel.updateAccount(req.user.id, req.body);
        return sendResponse(res, 200, 'Cập nhật thông tin tài khoản thành công', updated);
    } catch (error) {
        next(error);
    }
};

const changePassword = async (req, res, next) => {
    try {
        await authService.changePassword(req.user.id, req.body);
        return sendResponse(res, 200, 'Đổi mật khẩu thành công');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    register,
    login,
    logout,
    refreshToken,
    forgotPassword,
    resetPassword,
    getMe,
    updateMe,
    changePassword,
};

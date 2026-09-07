const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const AppError = require('../../utils/app-error');
const db = require('../../config/db');
const authModel = require('./auth.model');

const SALT_ROUNDS = 10;
const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProd ? (() => { throw new Error('FATAL: JWT_SECRET environment variable is missing in production'); })() : 'super_secret_jwt_access_key_2026_job_portal');
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || (isProd ? (() => { throw new Error('FATAL: REFRESH_TOKEN_SECRET environment variable is missing in production'); })() : 'super_secret_refresh_token_key_2026_job_portal');

const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

const generateTokens = (account) => {
    const payload = { id: account.id, email: account.email, role: account.role };

    const accessToken = jwt.sign(payload, JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    });

    const refreshToken = jwt.sign(payload, REFRESH_TOKEN_SECRET, {
        expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    });

    return { accessToken, refreshToken };
};

const enrichAccountInfo = async (account) => {
    if (!account) return account;
    try {
        if (account.role === 'candidate') {
            const res = await db.query('SELECT full_name, avatar_url, trust_score FROM candidate_profile WHERE account_id = $1', [account.id]);
            if (res.rows[0]) {
                account.name = res.rows[0].full_name;
                account.avatar_url = res.rows[0].avatar_url;
                account.trust_score = res.rows[0].trust_score;
            }
        } else if (account.role === 'employer') {
            const res = await db.query('SELECT company_name, avatar_url, verification_status, trust_score FROM employer WHERE account_id = $1', [account.id]);
            if (res.rows[0]) {
                account.company_name = res.rows[0].company_name;
                account.avatar_url = res.rows[0].avatar_url;
                account.verification_status = res.rows[0].verification_status;
                account.trust_score = res.rows[0].trust_score;
            }
        }
    } catch (e) {
        console.warn('Could not enrich account info:', e.message);
    }
    return account;
};

const register = async ({ email, phone, password, role, fullName, companyName }) => {
    const existing = await authModel.findByEmail(email);
    if (existing) {
        throw new AppError(409, 'Email này đã được đăng ký trong hệ thống');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const account = await db.withTransaction(async (client) => {
        const acc = await authModel.createAccount(client, {
            email,
            phone,
            passwordHash,
            role,
        });

        if (role === 'candidate') {
            await client.query(
                `INSERT INTO candidate_profile (account_id, full_name) VALUES ($1, $2)`,
                [acc.id, fullName || 'Ứng viên mới']
            );
        } else if (role === 'employer') {
            await client.query(
                `INSERT INTO employer (account_id, company_name) VALUES ($1, $2)`,
                [acc.id, companyName || 'Doanh nghiệp mới']
            );
        }

        return acc;
    });

    const tokens = generateTokens(account);
    const hashedRefresh = hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await authModel.updateRefreshToken(account.id, hashedRefresh, expiresAt);

    delete account.password;
    delete account.refresh_token_hash;
    await enrichAccountInfo(account);

    return { account, tokens };
};

const login = async ({ email, password }) => {
    const timings = {};

    // 2. Thời gian truy vấn DB tìm Account theo email (kết hợp JOIN hồ sơ, chỉ lấy các cột cần thiết)
    const t2_start = performance.now();
    const account = await authModel.findAccountForLogin(email);
    timings.db_find_account = performance.now() - t2_start;

    if (!account) {
        throw new AppError(401, 'Email hoặc mật khẩu không chính xác');
    }

    if (account.is_locked) {
        throw new AppError(403, 'Tài khoản của bạn đã bị khóa bởi quản trị viên');
    }

    // 3. Thời gian bcrypt.compare() so sánh mật khẩu
    const t3_start = performance.now();
    const isValidPassword = await bcrypt.compare(password, account.password);
    timings.bcrypt_compare = performance.now() - t3_start;

    if (!isValidPassword) {
        throw new AppError(401, 'Email hoặc mật khẩu không chính xác');
    }

    // 4. Thời gian ký JWT (access + refresh token)
    const t4_start = performance.now();
    const tokens = generateTokens(account);
    timings.jwt_sign = performance.now() - t4_start;

    const hashedRefresh = hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 5. Ghi refresh_token_hash vào DB
    const t5_start = performance.now();
    await authModel.updateRefreshToken(account.id, hashedRefresh, expiresAt);
    timings.db_update_refresh_token = performance.now() - t5_start;

    delete account.password;
    delete account.refresh_token_hash;
    timings.db_enrich_account = 0; // Đã tích hợp trong query 1

    return { account, tokens, timings };
};

const refreshAccessToken = async (refreshToken) => {
    if (!refreshToken) {
        throw new AppError(401, 'Vui lòng cung cấp refresh token');
    }

    let decoded;
    try {
        decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    } catch (err) {
        throw new AppError(401, 'Refresh token không hợp lệ hoặc đã hết hạn');
    }

    const account = await authModel.findById(decoded.id);
    if (!account || account.is_locked) {
        throw new AppError(401, 'Tài khoản không tồn tại hoặc đã bị khóa');
    }

    const hashedIncoming = hashToken(refreshToken);
    if (account.refresh_token_hash !== hashedIncoming) {
        throw new AppError(401, 'Refresh token đã bị thu hồi hoặc không hợp lệ');
    }

    if (new Date() > new Date(account.refresh_token_expires_at)) {
        throw new AppError(401, 'Refresh token đã hết hạn');
    }

    const newTokens = generateTokens(account);
    const newHashedRefresh = hashToken(newTokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await authModel.updateRefreshToken(account.id, newHashedRefresh, expiresAt);

    return newTokens;
};

const logout = async (accountId) => {
    await authModel.revokeRefreshToken(accountId);
};

const forgotPassword = async (email) => {
    const account = await authModel.findByEmail(email);
    if (!account) {
        return { message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi' };
    }

    const resetToken = jwt.sign({ id: account.id, purpose: 'reset_password' }, JWT_SECRET, {
        expiresIn: '15m',
    });

    return {
        message: 'Liên kết đặt lại mật khẩu đã được tạo thành công',
        resetToken,
    };
};

const resetPassword = async ({ token, newPassword }) => {
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.purpose !== 'reset_password') {
            throw new Error();
        }
    } catch (err) {
        throw new AppError(400, 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await authModel.updatePassword(decoded.id, passwordHash);
    await authModel.revokeRefreshToken(decoded.id);

    return { message: 'Đặt lại mật khẩu thành công' };
};

const changePassword = async (accountId, { oldPassword, newPassword }) => {
    const account = await authModel.findById(accountId);
    if (!account) {
        throw new AppError(404, 'Không tìm thấy tài khoản');
    }

    const isValid = await bcrypt.compare(oldPassword, account.password);
    if (!isValid) {
        throw new AppError(400, 'Mật khẩu cũ không chính xác');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await authModel.updatePassword(accountId, passwordHash);
    await authModel.revokeRefreshToken(accountId);

    return { message: 'Đổi mật khẩu thành công' };
};

module.exports = {
    register,
    login,
    refreshAccessToken,
    logout,
    forgotPassword,
    resetPassword,
    changePassword,
};

const db = require('../../config/db');
const profileModel = require('./profile.model');
const AppError = require('../../utils/app-error');
const { uploadToSupabase } = require('../../config/supabase');

const getMyProfile = async (accountId) => {
    const profile = await profileModel.getProfileByAccountId(accountId);
    if (!profile) {
        throw new AppError(404, 'Hồ sơ ứng viên chưa được khởi tạo');
    }
    return profile;
};

const updateMyProfile = async (accountId, data, file) => {
    let avatarUrl = data.avatar_url;
    if (file) {
        const ext = file.mimetype.split('/')[1] || 'jpg';
        const filePath = `candidate_${accountId}_${Date.now()}.${ext}`;
        try {
            avatarUrl = await uploadToSupabase('avatars', filePath, file.buffer, file.mimetype);
        } catch (err) {
            console.warn('Avatar upload to Supabase failed, using base64 fallback:', err.message);
            avatarUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        }
    }

    return await profileModel.updateProfile(accountId, {
        ...data,
        avatar_url: avatarUrl,
    });
};

const getMyCVs = async (accountId) => {
    const profile = await getMyProfile(accountId);
    return await profileModel.getCVsByProfileId(profile.id);
};

const getCVById = async (accountId, cvId) => {
    const profile = await getMyProfile(accountId);
    const cv = await profileModel.getCVById(cvId, profile.id);
    if (!cv) {
        throw new AppError(404, 'Không tìm thấy bản CV này');
    }
    return cv;
};

const createCV = async (accountId, data, file) => {
    const profile = await getMyProfile(accountId);

    if (!file && !data.attachment_file) {
        throw new AppError(400, 'Hệ thống chỉ chấp nhận CV tải lên từ tệp PDF hoặc Word (.docx). Vui lòng chọn tệp CV.');
    }

    let attachmentUrl = data.attachment_file;
    if (file) {
        const ext = file.originalname?.match(/\.[^/.]+$/)?.[0]?.toLowerCase() || (file.mimetype.includes('pdf') ? '.pdf' : '.docx');
        const filePath = `cv_${profile.id}_${Date.now()}${ext}`;
        try {
            attachmentUrl = await uploadToSupabase('cv-files', filePath, file.buffer, file.mimetype);
        } catch (uploadErr) {
            console.warn('Supabase CV upload warning, using buffer fallback:', uploadErr.message);
            attachmentUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        }
    }

    return await profileModel.createCV(profile.id, {
        ...data,
        attachment_file: attachmentUrl,
    });
};

const updateCV = async (accountId, cvId, data, file) => {
    const profile = await getMyProfile(accountId);
    const existing = await profileModel.getCVById(cvId, profile.id);
    if (!existing) {
        throw new AppError(404, 'Không tìm thấy bản CV để chỉnh sửa');
    }

    let attachmentUrl = data.attachment_file || existing.attachment_file;
    if (file) {
        const ext = file.originalname?.match(/\.[^/.]+$/)?.[0]?.toLowerCase() || (file.mimetype.includes('pdf') ? '.pdf' : '.docx');
        const filePath = `cv_${profile.id}_${Date.now()}${ext}`;
        try {
            attachmentUrl = await uploadToSupabase('cv-files', filePath, file.buffer, file.mimetype);
        } catch (uploadErr) {
            console.warn('Supabase CV upload warning, using buffer fallback:', uploadErr.message);
            attachmentUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        }
    }

    return await profileModel.updateCV(cvId, profile.id, {
        ...data,
        attachment_file: attachmentUrl,
    });
};

const deleteCV = async (accountId, cvId) => {
    const profile = await getMyProfile(accountId);
    const existing = await profileModel.getCVById(cvId, profile.id);
    if (!existing) {
        throw new AppError(404, 'Không tìm thấy bản CV để xóa');
    }

    // Check if CV is currently used in job_application
    const appCheck = await db.query(
        'SELECT COUNT(*) FROM job_application WHERE cv_version_id = $1',
        [cvId]
    );
    const count = parseInt(appCheck.rows[0].count, 10);
    if (count > 0) {
        throw new AppError(
            400,
            `Không thể xóa bản CV này vì bạn đã dùng nó để nộp ${count} đơn ứng tuyển cho Nhà tuyển dụng. Bạn có thể tải lên bản CV mới và đặt làm mặc định.`
        );
    }

    await profileModel.deleteCV(cvId, profile.id);

    // If deleted CV was default, promote the latest remaining CV as default
    if (existing.is_default) {
        const remaining = await db.query(
            'SELECT id FROM cv_version WHERE profile_id = $1 ORDER BY updated_date DESC LIMIT 1',
            [profile.id]
        );
        if (remaining.rows[0]) {
            await db.query('UPDATE cv_version SET is_default = TRUE WHERE id = $1', [remaining.rows[0].id]);
        }
    }
};

const setDefaultCV = async (accountId, cvId) => {
    const profile = await getMyProfile(accountId);
    const cv = await profileModel.setDefaultCV(cvId, profile.id);
    if (!cv) {
        throw new AppError(404, 'Không tìm thấy bản CV để đặt mặc định');
    }
    return cv;
};

module.exports = {
    getMyProfile,
    updateMyProfile,
    getMyCVs,
    getCVById,
    createCV,
    updateCV,
    deleteCV,
    setDefaultCV,
};

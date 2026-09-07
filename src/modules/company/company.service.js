const companyModel = require('./company.model');
const AppError = require('../../utils/app-error');
const { uploadToSupabase } = require('../../config/supabase');

const getMyCompany = async (accountId) => {
    const company = await companyModel.getCompanyByAccountId(accountId);
    if (!company) {
        throw new AppError(404, 'Thông tin doanh nghiệp chưa được khởi tạo');
    }
    return company;
};

const updateMyCompany = async (accountId, data, files, singleFile) => {
    let avatarUrl = data.avatar_url;
    let companyImageUrl = data.company_image_url;

    const avatarFile = (files && files.avatar && files.avatar[0]) || singleFile;
    const compImgFile = files && files.company_image && files.company_image[0];

    if (avatarFile) {
        const ext = avatarFile.mimetype.split('/')[1] || 'png';
        const filePath = `employer_${accountId}_${Date.now()}.${ext}`;
        try {
            avatarUrl = await uploadToSupabase('avatars', filePath, avatarFile.buffer, avatarFile.mimetype);
        } catch (err) {
            console.warn('Avatar upload failed, fallback to base64:', err.message);
            avatarUrl = `data:${avatarFile.mimetype};base64,${avatarFile.buffer.toString('base64')}`;
        }
    }

    if (compImgFile) {
        const ext = compImgFile.mimetype.split('/')[1] || 'png';
        const filePath = `company_banner_${accountId}_${Date.now()}.${ext}`;
        try {
            companyImageUrl = await uploadToSupabase('avatars', filePath, compImgFile.buffer, compImgFile.mimetype);
        } catch (err) {
            console.warn('Company banner upload failed, fallback to base64:', err.message);
            companyImageUrl = `data:${compImgFile.mimetype};base64,${compImgFile.buffer.toString('base64')}`;
        }
    }

    return await companyModel.updateCompany(accountId, {
        ...data,
        avatar_url: avatarUrl,
        company_image_url: companyImageUrl,
    });
};

const submitVerification = async (accountId, file, body) => {
    let documentUrl = body?.verification_document;
    if (file) {
        const ext = file.originalname?.match(/\.[^/.]+$/)?.[0]?.toLowerCase() || (file.mimetype.includes('pdf') ? '.pdf' : '.docx');
        const filePath = `emp_${accountId}_${Date.now()}${ext}`;
        try {
            documentUrl = await uploadToSupabase('verification-docs', filePath, file.buffer, file.mimetype);
        } catch (uploadErr) {
            console.warn('Supabase verification upload warning, using buffer fallback:', uploadErr.message);
            documentUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        }
    }

    if (!documentUrl) {
        throw new AppError(400, 'Vui lòng đính kèm tệp tài liệu xác minh doanh nghiệp (PDF hoặc Word .docx)');
    }

    return await companyModel.submitVerification(accountId, documentUrl);
};

module.exports = {
    getMyCompany,
    updateMyCompany,
    submitVerification,
};

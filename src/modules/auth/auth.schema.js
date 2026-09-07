const { z } = require('zod');

const registerSchema = z.object({
    body: z.object({
        email: z.string().email({ message: 'Email không hợp lệ' }),
        password: z.string().min(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' }),
        role: z.enum(['candidate', 'employer'], { message: 'Vai trò phải là candidate hoặc employer' }),
        fullName: z.string().optional(),
        full_name: z.string().optional(),
        companyName: z.string().optional(),
        company_name: z.string().optional(),
        phone: z.string().optional(),
        phone_number: z.string().optional(),
    }),
});

const loginSchema = z.object({
    body: z.object({
        email: z.string().email({ message: 'Email không hợp lệ' }),
        password: z.string().min(1, { message: 'Vui lòng nhập mật khẩu' }),
    }),
});

const forgotPasswordSchema = z.object({
    body: z.object({
        email: z.string().email({ message: 'Email không hợp lệ' }),
    }),
});

const resetPasswordSchema = z.object({
    body: z.object({
        token: z.string().min(1, { message: 'Token là bắt buộc' }),
        newPassword: z.string().min(6, { message: 'Mật khẩu mới phải từ 6 ký tự' }),
    }),
});

const changePasswordSchema = z.object({
    body: z.object({
        oldPassword: z.string().min(1, { message: 'Vui lòng nhập mật khẩu cũ' }),
        newPassword: z.string().min(6, { message: 'Mật khẩu mới phải từ 6 ký tự' }),
    }),
});

module.exports = {
    registerSchema,
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    changePasswordSchema,
};

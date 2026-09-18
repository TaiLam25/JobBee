require('dotenv').config();
const logger = require('../../config/logger');

/**
 * Real LLM API Client (Google Gemini / OpenAI compatible REST client)
 */
class LLMClient {
    constructor() {
        this.geminiApiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '';
        this.openaiApiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
        this.geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    }

    /**
     * Call Google Gemini REST API with candidate model fallback
     */
    async generateWithGemini(prompt, systemInstruction = '', timeoutMs = 12000) {
        const apiKey = this.geminiApiKey || process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY/AI_API_KEY is not configured');
        }

        const candidateModels = [this.geminiModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        const uniqueModels = [...new Set(candidateModels.filter(Boolean))];

        const contents = [];
        if (systemInstruction) {
            contents.push({
                role: 'user',
                parts: [{ text: `[System Instruction]: ${systemInstruction}` }]
            });
            contents.push({
                role: 'model',
                parts: [{ text: 'Đã hiểu. Tôi sẽ tuân thủ chỉ dẫn hệ thống của bạn.' }]
            });
        }
        contents.push({
            role: 'user',
            parts: [{ text: prompt }]
        });

        let lastError = null;

        for (const model of uniqueModels) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(timeoutMs),
                    body: JSON.stringify({
                        contents,
                        generationConfig: {
                            temperature: 0.4,
                            maxOutputTokens: 2048,
                        }
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    lastError = new Error(`Gemini API Error (${model} - ${response.status}): ${errText}`);
                    continue;
                }

                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    return text.trim();
                }
            } catch (err) {
                lastError = err;
            }
        }

        throw lastError || new Error('All Gemini models failed');
    }

    /**
     * Call OpenAI compatible API
     */
    async generateWithOpenAI(prompt, systemInstruction = '', timeoutMs = 12000) {
        const apiKey = this.openaiApiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY/AI_API_KEY is not configured');
        }

        const url = 'https://api.openai.com/v1/chat/completions';
        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            signal: AbortSignal.timeout(timeoutMs),
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages,
                temperature: 0.4,
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    }

    /**
     * Unified text generation with smart fallback
     */
    async generate(prompt, systemInstruction = '', timeoutMs = 12000) {
        // 1. Try Gemini if configured
        if (this.geminiApiKey || process.env.AI_API_KEY || process.env.GEMINI_API_KEY) {
            try {
                return await this.generateWithGemini(prompt, systemInstruction, timeoutMs);
            } catch (err) {
                logger.warn(`Gemini API call failed, trying fallback: ${err.message}`);
            }
        }

        // 2. Try OpenAI if configured
        if (this.openaiApiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY) {
            try {
                return await this.generateWithOpenAI(prompt, systemInstruction, timeoutMs);
            } catch (err) {
                logger.warn(`OpenAI API call failed: ${err.message}`);
            }
        }

        // 3. Fallback to mock / heuristic if no API key is available
        return null;
    }
}

module.exports = new LLMClient();

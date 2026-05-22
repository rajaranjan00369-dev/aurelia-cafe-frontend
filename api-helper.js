// api-helper.js
import { logger } from './logger.js';

export async function safeFetch(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const { signal } = controller;
    
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeoutMs);
    
    const fetchOptions = {
        ...options,
        signal
    };
    
    try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);
        
        // HTTP Error Handling
        if (!response.ok) {
            let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
            try {
                const errData = await response.json();
                if (errData && errData.message) {
                    errorMsg = errData.message;
                }
            } catch (e) {
                // If it's not JSON, try text
                try {
                    const text = await response.text();
                    if (text && text.length < 150) {
                        errorMsg = text;
                    }
                } catch (textErr) {}
            }
            throw new Error(errorMsg);
        }
        
        // Automatic JSON parsing
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return await response.json();
        }
        
        const rawText = await response.text();
        return rawText;
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeoutMs / 1000} seconds.`);
        }
        throw error;
    }
}

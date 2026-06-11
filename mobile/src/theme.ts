/**
 * SESAME Design System - Mai 2026
 * Precise colors and typography as per SESAME_Specifications_Techniques.docx
 */

export const Colors = {
    // Nocturne Theme (Default for Apps)
    nocturne: {
        background: '#101018',
        card: '#161624',
        textPrimary: '#E0DBD2',
        textSecondary: '#6A6680',
    },
    // Clair Theme (Default for Admin)
    clair: {
        background: '#F2F2F7',
        card: '#FFFFFF',
        textPrimary: '#1C1C2E',
        textSecondary: '#777788',
    },
    // Shared Brand Colors
    brand: {
        gold: '#C9A84C',
        success: '#4CAF82',
        info: '#4A9EFF',
        warning: '#FF9A3C',
        error: '#FF6464',
    },
};

export const Typography = {
    fontFamily: 'Inter', // Fallback to system font if not available
    weights: {
        regular: '400',
        semiBold: '600',
        bold: '700',
        black: '900',
    },
    sizes: {
        tiny: 11,
        small: 12,
        sub: 14,
        body: 15,
        header: 18,
        title: 24,
        giant: 32,
        mega: 44,
    }
};

export const BusinessRules = {
    commission: 0.20,
    pricing: {
        berline: { forfait: 12, threshold: 6, perKm: 2, passagers: 3 },
        van: { forfait: 12, threshold: 6, perKm: 3, passagers: 7 },
    },
    points: {
        perTranche: 10, // 1pt per 10 EUR
    }
};

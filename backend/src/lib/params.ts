import { query } from '../db';

export async function getSystemParameters() {
    const result = await query('SELECT cle, valeur FROM parametres_systeme');
    const params: Record<string, string> = {};
    result.rows.forEach((row) => {
        params[row.cle] = row.valeur;
    });
    return params;
}

export async function getSystemParameter<T = string>(cle: string, defaultValue: T): Promise<T> {
    const result = await query('SELECT valeur FROM parametres_systeme WHERE cle = $1', [cle]);
    if (result.rows.length === 0) return defaultValue;
    const val = result.rows[0].valeur;
    
    if (typeof defaultValue === 'number') return Number(val) as T;
    if (typeof defaultValue === 'boolean') return (val === 'true') as T;
    
    return val as T;
}

// Validations de format partagées (SIRET, IBAN). Vérifient que le numéro est BIEN FORMÉ
// (checksum), pas qu'il existe réellement — pour ça il faudrait l'API INSEE/Sirene.

// Clé de Luhn : checksum qui détecte les fautes de frappe (chiffre inversé, etc.).
export function luhnCheck(num: string): boolean {
    let sum = 0;
    for (let i = 0; i < num.length; i++) {
        let d = parseInt(num[num.length - 1 - i]);
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return sum % 10 === 0;
}

// SIRET valide = 14 chiffres + clé de Luhn. (9 chiffres SIREN + 5 chiffres établissement)
export function siretValide(siret: string): boolean {
    const s = String(siret).replace(/\s/g, '');
    return /^\d{14}$/.test(s) && luhnCheck(s);
}

// Email valide : format raisonnable (un seul @, partie locale et domaine non vides, TLD ≥ 2).
export function emailValide(email: string): boolean {
    const s = String(email).trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

// Téléphone FR valide : 10 chiffres commençant par 0, ou +33 / 0033 suivi de 9 chiffres.
// Tolère espaces, points, tirets et parenthèses dans la saisie.
export function telephoneValide(tel: string): boolean {
    const s = String(tel).replace(/[\s.\-()]/g, '');
    return /^(?:(?:\+33|0033)[1-9]\d{8}|0[1-9]\d{8})$/.test(s);
}

// IBAN valide = format + clé de contrôle mod 97 (norme ISO 13616).
export function ibanValide(iban: string): boolean {
    const s = String(iban).replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(s)) return false;
    // Déplace les 4 premiers caractères à la fin, convertit les lettres en nombres (A=10…Z=35).
    const reordered = s.slice(4) + s.slice(0, 4);
    const numeric = reordered.replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55));
    // Mod 97 par morceaux (le nombre dépasse la précision d'un Number JS).
    let remainder = 0;
    for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
    return remainder === 1;
}

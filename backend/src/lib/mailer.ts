import nodemailer from 'nodemailer';

// Service d'envoi d'email partagé (reset mot de passe, code secret fournisseur…).
// Transport Gmail (compte de test pour l'instant ; remplacer par le domaine en prod).
const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});

// En mode dev (EMAIL_DEV_MODE=true), on n'envoie rien : on logge dans la console.
export async function sendEmail(opts: { to: string; subject: string; html: string; logLabel?: string }): Promise<void> {
    if (process.env.EMAIL_DEV_MODE === 'true') {
        console.log(`[EMAIL DEV] To: ${opts.to} | ${opts.logLabel || opts.subject}`);
        return;
    }
    await mailer.sendMail({
        from: `SÉSAME <${process.env.GMAIL_USER}>`,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
    });
}

const layout = (inner: string) => `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#C9A84C;">SÉSAME</h2>
        ${inner}
    </div>
`;

// Code de réinitialisation du mot de passe.
export async function sendResetEmail(to: string, code: string): Promise<void> {
    await sendEmail({
        to,
        subject: 'Réinitialisation de votre mot de passe SÉSAME',
        logLabel: `Code reset: ${code}`,
        html: layout(`
            <p>Voici votre code de réinitialisation :</p>
            <div style="font-size:36px;font-weight:bold;letter-spacing:12px;text-align:center;padding:24px;background:#f5f5f5;border-radius:8px;">${code}</div>
            <p style="color:#666;font-size:13px;margin-top:16px;">Ce code est valable 15 minutes. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        `),
    });
}

// Code secret à 4 chiffres remis au responsable légal du fournisseur (validation des bons QR).
export async function sendCodeSecretFournisseur(to: string, societe: string, code: string): Promise<void> {
    await sendEmail({
        to,
        subject: 'Votre code secret fournisseur SÉSAME',
        logLabel: `Code secret fournisseur (${societe}): ${code}`,
        html: layout(`
            <p>Bonjour,</p>
            <p>Le compte fournisseur de <strong>${societe}</strong> a été créé sur SÉSAME. Voici votre code secret à 4 chiffres, à utiliser pour valider les bons cadeaux présentés par les ambassadeurs :</p>
            <div style="font-size:36px;font-weight:bold;letter-spacing:12px;text-align:center;padding:24px;background:#f5f5f5;border-radius:8px;">${code}</div>
            <p style="color:#666;font-size:13px;margin-top:16px;">Conservez ce code confidentiel. En cas d'oubli, l'administrateur SÉSAME peut le régénérer.</p>
        `),
    });
}

import bcrypt from 'bcrypt';

async function verify() {
    const match = await bcrypt.compare('sesame123', '$2b$10$hbWIRX.uHGu6XVshimv5uu/t7.SaMxa3tLmJYQdBLh2QtfCOSVilq');
    console.log('Password match:', match);
}

verify();

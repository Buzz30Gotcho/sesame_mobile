import express from 'express';
import cors from 'cors';
import 'express-async-errors';
import authRoutes from './routes/auth';
import ambassadeursRoutes from './routes/ambassadeurs';
import coursesRoutes from './routes/courses';
import boutiqueRoutes from './routes/boutique';
import echangesRoutes from './routes/echanges';
import fournisseursRoutes from './routes/fournisseurs';
import chatRoutes from './routes/chat';
import chauffeursRoutes from './routes/chauffeurs';
import adminRoutes from './routes/admin';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/ambassadeurs', ambassadeursRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/boutique', boutiqueRoutes);
app.use('/api/echanges', echangesRoutes);
app.use('/api/fournisseurs', fournisseursRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/chauffeurs', chauffeursRoutes);
app.use('/api/admin', adminRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

export default app;

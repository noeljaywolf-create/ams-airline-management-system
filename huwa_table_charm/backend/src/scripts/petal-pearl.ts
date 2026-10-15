import db from '../config/database';
import { seed } from '../../seeds/002_petal_pearl';
try { await seed(db); console.log('Petal & Pearl catalog added. Existing data retained.'); }
finally { await db.destroy(); }

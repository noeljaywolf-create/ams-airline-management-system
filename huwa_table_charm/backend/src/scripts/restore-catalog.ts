import db from '../config/database';
import {seed} from '../../seeds/003_restore_original_catalog';
try {await db.transaction(async trx=>{await seed(trx)});console.log('Missing original catalog entries restored; existing data retained.')}finally{await db.destroy()}
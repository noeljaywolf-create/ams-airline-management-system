import type {Knex} from 'knex';import {v4 as uuid} from 'uuid';import catalog from '../catalog/table-charm.json';
export async function seed(knex:Knex):Promise<void>{
 for(const item of catalog){
 let category=await knex('categories').where({slug:item.category}).first();if(!category){category={id:uuid(),slug:item.category,title:({dinnerware:'Dinnerware',drinkware:'Glassware',cookware:'Cookware',appliances:'Kettles & Toasters',storage:'Kitchen Storage',serveware:'Serveware',flatware:'Cutlery',utensils:'Kitchen Tools'} as any)[item.category]};await knex('categories').insert(category)}
 let p=await knex('products').where({slug:item.slug}).first();if(p)continue;
 const id=uuid();await knex('products').insert({id,slug:item.slug,title:item.title,type:item.type,category_id:category.id,description:item.description,material:item.collection==='Crystalite'?'glass':item.collection==='Stainless Steel'?'stainless_steel':'',features:JSON.stringify({requires_quote:true}),images:JSON.stringify([item.image]),tags:JSON.stringify(['table-charm',item.collection,'price-on-request']),published:true});
 await knex('variants').insert({id:uuid(),product_id:id,sku:item.sku,title:item.title,options:JSON.stringify({collection:item.collection}),price_cents:0,stock:0,lead_time_days:0,weight_kg:0,width_cm:0,height_cm:0,depth_cm:0,fulfilment_mode:'stocked',is_engravable:false,image:item.image});
 }
}

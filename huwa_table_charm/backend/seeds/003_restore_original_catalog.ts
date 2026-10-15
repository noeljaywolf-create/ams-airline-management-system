import type { Knex } from 'knex';
import { v4 as uuid } from 'uuid';
// Restore only missing catalog entries from the recovered original seed. Never delete data.
export async function seed(knex:Knex):Promise<void> {
const catIds:any={};
for(const [slug,title] of Object.entries({cookware:'Cookware',dinnerware:'Dinnerware',bakeware:'Bakeware',drinkware:'Drinkware',flatware:'Flatware',utensils:'Utensils & Gadgets',storage:'Food Storage'})){
let c=await knex('categories').where({slug}).first();
if(!c){c={id:uuid(),slug,title};await knex('categories').insert(c)}catIds[slug]=c.id;
}
  interface ProductSeed {
    id: string;
    type: string;
    title: string;
    slug: string;
    description: string;
    category_id: string;
    material: string;
    features: Record<string, unknown>;
    images: string[];
    tags: string[];
    variants: VariantSeed[];
  }

  interface VariantSeed {
    sku: string;
    title: string;
    options: Record<string, string>;
    price: number;
    compareAtPrice?: number;
    stock: number | null;
    fulfilmentMode: string;
    isEngravable?: boolean;
    image?: string;
  }

  const products: ProductSeed[] = [
    {
      id: uuid(), type: 'cookware', title: 'Ceramic Non-Stick Frying Pan', slug: 'ceramic-non-stick-frying-pan',
      description: 'Eco-friendly ceramic non-stick surface, PFOA and PFAS free. Perfect for everyday cooking on all hob types.',
      category_id: catIds.cookware, material: 'aluminium',
      features: { induction_compatible: true, microwave_safe: false, dishwasher_safe: true, pfas_free: true, oven_safe: true, oven_temp_c: 220 },
      images: ['https://images.unsplash.com/photo-1604762433261-a046add6fc11?auto=format&fit=crop&w=900&q=80'], tags: ['non-stick', 'ceramic', 'eco-friendly'],
      variants: [
        { sku: 'FP-CER-24', title: '24 cm', options: { size: '24 cm' }, price: 39.99, compareAtPrice: 49.99, stock: 120, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1604762433261-a046add6fc11?auto=format&fit=crop&w=900&q=80' },
        { sku: 'FP-CER-28', title: '28 cm', options: { size: '28 cm' }, price: 44.99, compareAtPrice: 54.99, stock: 85, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1604762433261-a046add6fc11?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'cookware', title: 'Cast Iron Dutch Oven', slug: 'cast-iron-dutch-oven',
      description: 'Enameled cast iron for superior heat retention. Ideal for slow-cooking, stews, and braises. Oven safe to 260°C.',
      category_id: catIds.cookware, material: 'cast_iron',
      features: { induction_compatible: true, microwave_safe: false, dishwasher_safe: false, pfas_free: true, oven_safe: true, oven_temp_c: 260 },
      images: ['https://images.unsplash.com/photo-1541508168132-0b1d81249c25?auto=format&fit=crop&w=900&q=80'], tags: ['cast iron', 'dutch oven', 'slow cooking'],
      variants: [
        { sku: 'DO-CI-26', title: '26 cm / 4.5L', options: { size: '26 cm', capacity: '4.5L' }, price: 129.99, stock: 30, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1541508168132-0b1d81249c25?auto=format&fit=crop&w=900&q=80' },
        { sku: 'DO-CI-30', title: '30 cm / 7L', options: { size: '30 cm', capacity: '7L' }, price: 159.99, compareAtPrice: 189.99, stock: 18, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1541508168132-0b1d81249c25?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'cookware', title: 'Stainless Steel Saucepan', slug: 'stainless-steel-saucepans',
      description: 'Tri-ply stainless steel with aluminium core for even heating. Dishwasher safe and induction compatible.',
      category_id: catIds.cookware, material: 'stainless_steel',
      features: { induction_compatible: true, microwave_safe: false, dishwasher_safe: true, pfas_free: true, oven_safe: true, oven_temp_c: 240 },
      images: ['https://images.unsplash.com/photo-1541508168132-0b1d81249c25?auto=format&fit=crop&w=900&q=80'], tags: ['stainless steel', 'tri-ply'],
      variants: [
        { sku: 'SS-SP-16', title: '16 cm / 1.5L', options: { size: '16 cm', capacity: '1.5L' }, price: 49.99, stock: 60, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1541508168132-0b1d81249c25?auto=format&fit=crop&w=900&q=80' },
        { sku: 'SS-SP-20', title: '20 cm / 3L', options: { size: '20 cm', capacity: '3L' }, price: 59.99, stock: 45, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1541508168132-0b1d81249c25?auto=format&fit=crop&w=900&q=80' },
        { sku: 'SS-SP-24', title: '24 cm / 5L', options: { size: '24 cm', capacity: '5L' }, price: 69.99, compareAtPrice: 79.99, stock: 35, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1541508168132-0b1d81249c25?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'tableware', title: 'Porcelain Dinner Set (12pc)', slug: 'porcelain-dinner-set-12pc',
      description: 'Classic white porcelain set for 4: 4 dinner plates, 4 side plates, 4 bowls. Microwave and dishwasher safe.',
      category_id: catIds.dinnerware, material: 'porcelain',
      features: { induction_compatible: false, microwave_safe: true, dishwasher_safe: true, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=900&q=80'], tags: ['porcelain', 'dinner set', 'classic'],
      variants: [
        { sku: 'PD-12PC-WH', title: 'White', options: { color: 'White' }, price: 89.99, compareAtPrice: 119.99, stock: 50, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=900&q=80' },
        { sku: 'PD-12PC-BL', title: 'Blue', options: { color: 'Blue' }, price: 89.99, stock: 35, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'tableware', title: 'Stoneware Bowls (Set of 4)', slug: 'stoneware-bowls-set-4',
      description: 'Handcrafted stoneware bowls perfect for soups, salads, and cereal. Each piece has a unique glaze finish.',
      category_id: catIds.dinnerware, material: 'stoneware',
      features: { induction_compatible: false, microwave_safe: true, dishwasher_safe: true, pfas_free: true, oven_safe: true, oven_temp_c: 180 },
      images: ['https://images.unsplash.com/photo-1489421234833-3e44ab2f5470?auto=format&fit=crop&w=900&q=80'], tags: ['stoneware', 'handcrafted'],
      variants: [
        { sku: 'SW-BL-SET4', title: 'Mist Grey', options: { color: 'Mist Grey' }, price: 54.99, stock: 40, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1489421234833-3e44ab2f5470?auto=format&fit=crop&w=900&q=80' },
        { sku: 'SW-BL-SET4-ENG', title: 'Mist Grey (Engraved)', options: { color: 'Mist Grey', engraving: 'Custom Name' }, price: 69.99, stock: null, fulfilmentMode: 'make_to_order', isEngravable: true, image: 'https://images.unsplash.com/photo-1489421234833-3e44ab2f5470?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'bakeware', title: 'Non-Stick Baking Tray', slug: 'non-stick-baking-tray',
      description: 'Heavy-duty carbon steel baking tray with premium non-stick coating. Dishwasher safe.',
      category_id: catIds.bakeware, material: 'carbon_steel',
      features: { induction_compatible: false, microwave_safe: false, dishwasher_safe: true, pfas_free: false, oven_safe: true, oven_temp_c: 230 },
      images: ['https://images.unsplash.com/photo-1586664510812-52b8306f3fb0?auto=format&fit=crop&w=900&q=80'], tags: ['baking', 'non-stick', 'oven'],
      variants: [
        { sku: 'BT-NS-34', title: '34 × 24 cm', options: { size: '34 × 24 cm' }, price: 24.99, stock: 100, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1586664510812-52b8306f3fb0?auto=format&fit=crop&w=900&q=80' },
        { sku: 'BT-NS-45', title: '45 × 32 cm', options: { size: '45 × 32 cm' }, price: 32.99, stock: 70, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1586664510812-52b8306f3fb0?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'bakeware', title: 'Silicone Muffin Tray (12 cups)', slug: 'silicone-muffin-tray-12',
      description: 'Flexible food-grade silicone muffin tray. Non-stick, dishwasher safe, and oven safe to 220°C.',
      category_id: catIds.bakeware, material: 'silicone',
      features: { induction_compatible: false, microwave_safe: false, dishwasher_safe: true, pfas_free: true, oven_safe: true, oven_temp_c: 220 },
      images: ['https://images.unsplash.com/photo-1722454978152-25a952378284?auto=format&fit=crop&w=900&q=80'], tags: ['silicone', 'muffin', 'baking'],
      variants: [
        { sku: 'MT-SI-12-BL', title: 'Blue', options: { color: 'Blue' }, price: 18.99, stock: 90, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1722454978152-25a952378284?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'drinkware', title: 'Borosilicate Glass Tea Set', slug: 'borosilicate-glass-tea-set',
      description: 'Heat-resistant borosilicate glass teapot with 4 cups. Safe for stovetop and microwave.',
      category_id: catIds.drinkware, material: 'borosilicate_glass',
      features: { induction_compatible: false, microwave_safe: true, dishwasher_safe: true, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1523247297454-ef69fd04e051?auto=format&fit=crop&w=900&q=80'], tags: ['glass', 'tea', 'teapot'],
      variants: [
        { sku: 'BG-TS-SET5', title: '5-piece set', options: { pieces: '5' }, price: 44.99, stock: 40, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1523247297454-ef69fd04e051?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'drinkware', title: 'Double Wall Insulated Tumblers (Set of 2)', slug: 'double-wall-tumblers-set-2',
      description: 'Double wall vacuum insulated stainless steel tumblers. Keeps drinks hot/cold for hours.',
      category_id: catIds.drinkware, material: 'stainless_steel',
      features: { induction_compatible: false, microwave_safe: false, dishwasher_safe: true, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1604959807242-9eb8fd0b5bfa?auto=format&fit=crop&w=900&q=80'], tags: ['insulated', 'tumblers', 'hot and cold'],
      variants: [
        { sku: 'DW-TB-350-SV', title: '350ml Silver', options: { capacity: '350ml', color: 'Silver' }, price: 29.99, stock: 75, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1604959807242-9eb8fd0b5bfa?auto=format&fit=crop&w=900&q=80' },
        { sku: 'DW-TB-350-BK', title: '350ml Black', options: { capacity: '350ml', color: 'Black' }, price: 29.99, stock: 75, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1604959807242-9eb8fd0b5bfa?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'flatware', title: 'Stainless Steel Cutlery Set (24pc)', slug: 'stainless-steel-cutlery-set-24pc',
      description: '24-piece mirror-polished stainless steel cutlery set for 6. Includes knives, forks, spoons, and teaspoons.',
      category_id: catIds.flatware, material: 'stainless_steel',
      features: { induction_compatible: false, microwave_safe: false, dishwasher_safe: true, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1586969593928-1c87c1f9c2ef?auto=format&fit=crop&w=900&q=80'], tags: ['cutlery', 'flatware', 'stainless steel'],
      variants: [
        { sku: 'FS-24PC-MP', title: 'Mirror Polish', options: { finish: 'Mirror Polish' }, price: 59.99, compareAtPrice: 74.99, stock: 60, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1586969593928-1c87c1f9c2ef?auto=format&fit=crop&w=900&q=80' },
        { sku: 'FS-24PC-BL', title: 'Matte Black', options: { finish: 'Matte Black' }, price: 69.99, stock: 45, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1586969593928-1c87c1f9c2ef?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'utensils', title: 'Bamboo Utensil Set (6pc)', slug: 'bamboo-utensil-set-6pc',
      description: 'Sustainable bamboo cooking utensils. Includes spatula, spoon, slotted spoon, turner, tongs, and ladle.',
      category_id: catIds.utensils, material: 'bamboo',
      features: { induction_compatible: false, microwave_safe: false, dishwasher_safe: false, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1721934081767-1fb587a9c7f1?auto=format&fit=crop&w=900&q=80'], tags: ['bamboo', 'sustainable', 'eco'],
      variants: [
        { sku: 'BU-6PC-NAT', title: 'Natural', options: { color: 'Natural' }, price: 24.99, stock: 80, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1721934081767-1fb587a9c7f1?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'storage', title: 'Glass Food Containers (Set of 5)', slug: 'glass-food-containers-set-5',
      description: 'Borosilicate glass containers with airtight bamboo lids. Oven, microwave, and dishwasher safe.',
      category_id: catIds.storage, material: 'borosilicate_glass',
      features: { induction_compatible: false, microwave_safe: true, dishwasher_safe: true, pfas_free: true, oven_safe: true, oven_temp_c: 200 },
      images: ['https://images.unsplash.com/photo-1754391853150-561b59ad8e99?auto=format&fit=crop&w=900&q=80'], tags: ['glass', 'storage', 'meal prep'],
      variants: [
        { sku: 'GC-5PC-MIX', title: 'Mixed sizes (120ml–900ml)', options: { sizes: 'Mixed' }, price: 34.99, compareAtPrice: 44.99, stock: 55, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1754391853150-561b59ad8e99?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'storage', title: 'Airtight Spice Jars (Set of 12)', slug: 'airtight-spice-jars-set-12',
      description: 'Glass spice jars with bamboo lids and pre-printed labels. Perfect for organized spice storage.',
      category_id: catIds.storage, material: 'glass',
      features: { induction_compatible: false, microwave_safe: false, dishwasher_safe: true, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1754391853150-561b59ad8e99?auto=format&fit=crop&w=900&q=80'], tags: ['spice jars', 'organization'],
      variants: [
        { sku: 'SJ-12PC-100', title: '100ml', options: { capacity: '100ml' }, price: 22.99, stock: 100, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1754391853150-561b59ad8e99?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    // ================== CHARM / SERVE TABLE ACCENTS ==================
    {
      id: uuid(), type: 'tableware', title: 'Acacia Wood Serving Board (Set of 3)', slug: 'acacia-wood-serving-board-set-3',
      description: 'Hand-finished acacia wood boards for cheese, charcuterie, and tapas. Naturally antibacterial, easy to care for, and beautiful enough to leave on the table.',
      category_id: catIds.dinnerware, material: 'wood',
      features: { induction_compatible: false, microwave_safe: false, dishwasher_safe: false, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1721934081767-1fb587a9c7f1?auto=format&fit=crop&w=900&q=80'], tags: ['serveware', 'charcuterie', 'wood'],
      variants: [
        { sku: 'SB-AC-3PC', title: '3-piece set', options: { pieces: '3' }, price: 34.99, compareAtPrice: 44.99, stock: 60, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1721934081767-1fb587a9c7f1?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'tableware', title: 'Ceramic Serving Platter (Set of 3)', slug: 'ceramic-serving-platter-set-3',
      description: 'Chip-resistant porcelain serving platters in three sizes. Ideal for canapés, cheeses, desserts, and family-style mains. Microwave, oven, and dishwasher safe.',
      category_id: catIds.dinnerware, material: 'porcelain',
      features: { induction_compatible: false, microwave_safe: true, dishwasher_safe: true, pfas_free: true, oven_safe: true, oven_temp_c: 220 },
      images: ['https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=900&q=80'], tags: ['serveware', 'platter', 'porcelain'],
      variants: [
        { sku: 'PL-CER-3PC', title: 'Set of 3', options: { pieces: '3' }, price: 39.99, compareAtPrice: 52.0, stock: 55, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'tableware', title: 'Rattan Placemat Set (6pc)', slug: 'rattan-placemat-set-6',
      description: 'Natural woven rattan placemats that add warmth and texture to any table setting. Easy to wipe clean and stack neatly.',
      category_id: catIds.dinnerware, material: 'rattan',
      features: { induction_compatible: false, microwave_safe: false, dishwasher_safe: false, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1489421234833-3e44ab2f5470?auto=format&fit=crop&w=900&q=80'], tags: ['placemats', 'table setting', 'rattan'],
      variants: [
        { sku: 'PM-RT-6PC', title: '6 pc', options: { pieces: '6' }, price: 27.99, stock: 80, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1489421234833-3e44ab2f5470?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'tableware', title: 'Linen Napkin Set (6pc)', slug: 'linen-napkin-set-6',
      description: 'Stonewashed 100% linen napkins with a soft, lived-in feel. Absorbent, durable, and perfect for everyday or entertaining.',
      category_id: catIds.dinnerware, material: 'linen',
      features: { induction_compatible: false, microwave_safe: false, dishwasher_safe: false, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1489421234833-3e44ab2f5470?auto=format&fit=crop&w=900&q=80'], tags: ['napkins', 'linen', 'table setting'],
      variants: [
        { sku: 'NP-LN-6PC', title: '6 pc', options: { pieces: '6' }, price: 24.99, stock: 70, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1489421234833-3e44ab2f5470?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'tableware', title: 'Marble Cheese Board with Knives', slug: 'marble-cheese-board-with-knives',
      description: 'Sleek natural marble board with a set of stainless steel cheese knives. Keeps cheese chilled and looks striking on the table.',
      category_id: catIds.dinnerware, material: 'marble',
      features: { induction_compatible: false, microwave_safe: false, dishwasher_safe: false, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1548594172-09665cd0e236?auto=format&fit=crop&w=900&q=80'], tags: ['cheese board', 'marble', 'serveware'],
      variants: [
        { sku: 'CB-MB-KN', title: 'Board + 4 knives', options: { knives: '4' }, price: 49.99, stock: 40, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1548594172-09665cd0e236?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'tableware', title: 'Ceramic Charger Plates (Set of 6)', slug: 'ceramic-charger-plates-set-6',
      description: 'Elegant ceramic charger plates that frame your dinnerware for special occasions. Stackable, dishwasher safe, and available in two finishes.',
      category_id: catIds.dinnerware, material: 'ceramic',
      features: { induction_compatible: false, microwave_safe: true, dishwasher_safe: true, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=900&q=80'], tags: ['charger plates', 'table setting', 'ceramic'],
      variants: [
        { sku: 'CP-CR-6-WH', title: 'White', options: { set: '6', color: 'White' }, price: 32.99, stock: 65, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=900&q=80' },
        { sku: 'CP-CR-6-GD', title: 'Gold Rim', options: { set: '6', color: 'Gold Rim' }, price: 38.99, stock: 45, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'drinkware', title: 'Glass Carafe with Tumblers (Set of 6)', slug: 'glass-carafe-with-tumblers-set-6',
      description: 'Elegant borosilicate glass carafe with 6 matching tumblers. Perfect for serving water, juice, or infused beverages.',
      category_id: catIds.drinkware, material: 'glass',
      features: { induction_compatible: false, microwave_safe: true, dishwasher_safe: true, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1523247297454-ef69fd04e051?auto=format&fit=crop&w=900&q=80'], tags: ['carafe', 'glassware', 'serveware'],
      variants: [
        { sku: 'CF-GL-SET6', title: '1L carafe + 6 tumblers', options: { capacity: '1L' }, price: 32.99, stock: 50, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1523247297454-ef69fd04e051?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'drinkware', title: 'Nordic Glass Tumblers (Set of 4)', slug: 'nordic-glass-tumblers-set-4',
      description: 'Durable, stackable tempered glass tumblers with a clean Nordic silhouette. Ideal for water, smoothies, and everyday drinks.',
      category_id: catIds.drinkware, material: 'glass',
      features: { induction_compatible: false, microwave_safe: true, dishwasher_safe: true, pfas_free: true, oven_safe: false },
      images: ['https://images.unsplash.com/photo-1604959807242-9eb8fd0b5bfa?auto=format&fit=crop&w=900&q=80'], tags: ['tumblers', 'glassware', 'drinkware'],
      variants: [
        { sku: 'TG-NO-4PC', title: '300ml Set of 4', options: { capacity: '300ml', pieces: '4' }, price: 26.99, stock: 90, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1604959807242-9eb8fd0b5bfa?auto=format&fit=crop&w=900&q=80' },
      ],
    },
    {
      id: uuid(), type: 'bakeware', title: 'Carbon Steel Cake & Pie Pans (Set of 4)', slug: 'carbon-steel-cake-pie-pans-set-4',
      description: 'Heavy-duty carbon steel bakeware set including round cake, square cake, loaf, and pie pans. Even heat for a perfect bake every time.',
      category_id: catIds.bakeware, material: 'carbon_steel',
      features: { induction_compatible: false, microwave_safe: false, dishwasher_safe: true, pfas_free: true, oven_safe: true, oven_temp_c: 230 },
      images: ['https://images.unsplash.com/photo-1586664510812-52b8306f3fb0?auto=format&fit=crop&w=900&q=80'], tags: ['bakeware', 'cake pan', 'oven'],
      variants: [
        { sku: 'BP-CS-4PC', title: '4-piece set', options: { pieces: '4' }, price: 36.99, compareAtPrice: 45.99, stock: 50, fulfilmentMode: 'stocked', image: 'https://images.unsplash.com/photo-1586664510812-52b8306f3fb0?auto=format&fit=crop&w=900&q=80' },
      ],
    },
  ];


  for (const p of products) {
    if (await knex("products").where({slug:p.slug}).first()) continue;
    await knex('products').insert({
      id: p.id,
      type: p.type,
      title: p.title,
      slug: p.slug,
      description: p.description,
      category_id: p.category_id,
      material: p.material,
      features: JSON.stringify(p.features),
      images: JSON.stringify(p.images),
      tags: JSON.stringify(p.tags),
      published: true,
    });

    for (const v of p.variants) {
      const variantId = uuid();
      await knex('variants').insert({
        id: variantId,
        product_id: p.id,
        sku: v.sku,
        title: v.title,
        options: JSON.stringify(v.options),
        price_cents: Math.round(v.price * 100),
        compare_at_price_cents: v.compareAtPrice ? Math.round(v.compareAtPrice * 100) : null,
        stock: v.stock,
        lead_time_days: v.fulfilmentMode === 'make_to_order' ? 14 : 0,
        weight_kg: 1.0,
        width_cm: 25,
        height_cm: 8,
        depth_cm: 25,
        fulfilment_mode: v.fulfilmentMode,
        is_engravable: v.isEngravable ?? false,
        image: v.image ?? null,
      });

      if (v.fulfilmentMode === 'stocked') {
        await knex('inventory_stock').insert({
          id: uuid(),
          variant_id: variantId,
          on_hand: v.stock,
          reserved: 0,
          sellable: v.stock,
          reorder_point: 10,
          backorder_allowed: false,
        });
      }
    }
  }


}
const { PrismaClient, StockType, StockSource } = require('@prisma/client');

const prisma = new PrismaClient();

const ingredients = [
  { id: 'ing_coffee_bean', name: 'Hat ca phe', unit: 'kg', stock: 12, minStock: 3, importPrice: 220000 },
  { id: 'ing_condensed_milk', name: 'Sua dac', unit: 'lon', stock: 40, minStock: 10, importPrice: 28000 },
  { id: 'ing_fresh_milk', name: 'Sua tuoi', unit: 'lit', stock: 30, minStock: 8, importPrice: 38000 },
  { id: 'ing_sugar', name: 'Duong', unit: 'kg', stock: 20, minStock: 5, importPrice: 25000 },
  { id: 'ing_black_tea', name: 'Tra den', unit: 'kg', stock: 8, minStock: 2, importPrice: 160000 },
  { id: 'ing_matcha_powder', name: 'Bot matcha', unit: 'kg', stock: 6, minStock: 2, importPrice: 420000 },
  { id: 'ing_avocado', name: 'Bo sap', unit: 'kg', stock: 15, minStock: 4, importPrice: 90000 },
  { id: 'ing_croissant_dough', name: 'Bot croissant', unit: 'kg', stock: 10, minStock: 3, importPrice: 120000 },
  { id: 'ing_boba', name: 'Tran chau', unit: 'kg', stock: 9, minStock: 2, importPrice: 85000 },
  { id: 'ing_cheese_foam', name: 'Kem cheese', unit: 'lit', stock: 7, minStock: 2, importPrice: 150000 },
];

async function upsertIngredient(item) {
  const existing = await prisma.ingredient.findUnique({
    where: { id: item.id },
  });

  if (!existing) {
    const created = await prisma.ingredient.create({
      data: {
        id: item.id,
        name: item.name,
        unit: item.unit,
        stock: item.stock,
        minStock: item.minStock,
        importPrice: item.importPrice,
        isActive: true,
      },
    });

    await prisma.stockMovement.create({
      data: {
        ingredientId: created.id,
        type: StockType.IMPORT,
        source: StockSource.SYSTEM,
        quantity: item.stock,
        unitPrice: item.importPrice,
        totalPrice: item.stock * item.importPrice,
        reason: 'Initial seed import',
        note: 'Seed data for delivery package',
        referenceCode: `SEED-${item.id.toUpperCase()}`,
        beforeStock: 0,
        afterStock: item.stock,
        createdBy: 'seed-script',
      },
    });

    return { created: true, updated: false };
  }

  const currentStock = Number(existing.stock || 0);
  const targetStock = Number(item.stock || 0);
  const nextStock = currentStock >= targetStock ? currentStock : targetStock;

  await prisma.ingredient.update({
    where: { id: item.id },
    data: {
      name: item.name,
      unit: item.unit,
      minStock: item.minStock,
      importPrice: item.importPrice,
      stock: nextStock,
      isActive: true,
    },
  });

  if (nextStock > currentStock) {
    const delta = nextStock - currentStock;
    await prisma.stockMovement.create({
      data: {
        ingredientId: item.id,
        type: StockType.IMPORT,
        source: StockSource.SYSTEM,
        quantity: delta,
        unitPrice: item.importPrice,
        totalPrice: delta * item.importPrice,
        reason: 'Seed top-up',
        note: 'Top-up to required baseline stock',
        referenceCode: `SEED-TOPUP-${item.id.toUpperCase()}`,
        beforeStock: currentStock,
        afterStock: nextStock,
        createdBy: 'seed-script',
      },
    });
  }

  return { created: false, updated: true };
}

async function main() {
  let created = 0;
  let updated = 0;

  for (const item of ingredients) {
    const result = await upsertIngredient(item);
    if (result.created) {
      created += 1;
    } else if (result.updated) {
      updated += 1;
    }
  }

  console.log(`Seeded inventory ingredients: created=${created}, updated=${updated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const drinkCustomizations = [
  {
    id: 'size',
    label: 'Size',
    type: 'single',
    required: true,
    options: [
      { value: 'S', label: 'S', priceDelta: 0 },
      { value: 'M', label: 'M (+5.000đ)', priceDelta: 5000 },
      { value: 'L', label: 'L (+10.000đ)', priceDelta: 10000 },
    ],
  },
  {
    id: 'ice',
    label: 'Da',
    type: 'single',
    options: [
      { value: 'less_ice', label: 'It da', priceDelta: 0 },
      { value: 'normal_ice', label: 'Da vua', priceDelta: 0 },
      { value: 'no_ice', label: 'Khong da', priceDelta: 0 },
    ],
  },
  {
    id: 'sugar',
    label: 'Duong',
    type: 'single',
    options: [
      { value: 'less_sugar', label: 'It duong', priceDelta: 0 },
      { value: 'normal_sugar', label: 'Duong vua', priceDelta: 0 },
      { value: 'no_sugar', label: 'Khong duong', priceDelta: 0 },
    ],
  },
  {
    id: 'toppings',
    label: 'Topping',
    type: 'multi',
    options: [
      { value: 'boba', label: 'Tran chau (+7.000đ)', priceDelta: 7000 },
      { value: 'foam', label: 'Kem cheese (+8.000đ)', priceDelta: 8000 },
      { value: 'pudding', label: 'Pudding (+6.000đ)', priceDelta: 6000 },
    ],
  },
  {
    id: 'note',
    label: 'Ghi chu',
    type: 'text',
    placeholder: 'VD: it ngot, nhieu da...',
  },
];

const foodCustomizations = [
  {
    id: 'heat',
    label: 'Che bien',
    type: 'single',
    options: [
      { value: 'serve_now', label: 'Dung ngay', priceDelta: 0 },
      { value: 'warm_up', label: 'Lam nong', priceDelta: 0 },
    ],
  },
  {
    id: 'note',
    label: 'Ghi chu',
    type: 'text',
    placeholder: 'VD: cat doi, it ngot...',
  },
];

const items = [
  { name: 'Ca phe den', description: 'Ca phe den truyen thong', price: 25000, category: 'coffee' },
  { name: 'Ca phe sua', description: 'Ca phe sua da', price: 30000, category: 'coffee' },
  { name: 'Bac xiu', description: 'Ca phe sua nhieu sua', price: 32000, category: 'coffee' },
  { name: 'Espresso', description: 'Espresso dam dac', price: 35000, category: 'coffee' },
  { name: 'Cappuccino', description: 'Cappuccino kem sua', price: 45000, category: 'coffee' },
  { name: 'Latte', description: 'Cafe Latte min mang', price: 45000, category: 'coffee' },
  { name: 'Tra dao', description: 'Tra dao cam sa', price: 40000, category: 'tea' },
  { name: 'Matcha Latte', description: 'Tra xanh Nhat Ban', price: 50000, category: 'tea' },
  { name: 'Sinh to bo', description: 'Sinh to bo beo ngay', price: 45000, category: 'smoothie' },
  { name: 'Croissant', description: 'Croissant bo Phap', price: 35000, category: 'food' },
];

const categoryNameMap: Record<string, string> = {
  coffee: 'Ca phe',
  tea: 'Tra',
  smoothie: 'Sinh to',
  food: 'Banh va mon an',
};

const promoCodes = [
  {
    code: 'WELCOME10',
    description: 'Giam 10% toi da 20.000đ cho don tu 50.000đ',
    discountType: 'PERCENT',
    discountValue: 10,
    minOrderAmount: 50000,
    maxDiscount: 20000,
    isActive: true,
  },
  {
    code: 'COFFEE30K',
    description: 'Giam 30.000đ cho don tu 150.000đ',
    discountType: 'FIXED',
    discountValue: 30000,
    minOrderAmount: 150000,
    maxDiscount: null,
    isActive: true,
  },
] as const;

async function main() {
  const categoryIds: Record<string, string> = {};
  const categoryKeys = Object.keys(categoryNameMap);
  for (let index = 0; index < categoryKeys.length; index += 1) {
    const key = categoryKeys[index];
    const existingCategory = await prisma.menuCategory.findFirst({
      where: {
        name: categoryNameMap[key],
        branchId: null,
      },
      select: { id: true },
    });
    const category = existingCategory
      ? await prisma.menuCategory.update({
          where: { id: existingCategory.id },
          data: {
            isActive: true,
            sortOrder: index,
            branchId: null,
          },
          select: { id: true },
        })
      : await prisma.menuCategory.create({
          data: {
            name: categoryNameMap[key],
            branchId: null,
            isActive: true,
            sortOrder: index,
          },
          select: { id: true },
        });
    categoryIds[key] = category.id;
  }

  for (const item of items) {
    const image = `https://placehold.co/600x400?text=${encodeURIComponent(item.name)}`;
    const customizations = item.category === 'food' ? foodCustomizations : drinkCustomizations;
    const categoryId = categoryIds[item.category] || null;

    const existing = await prisma.menuItem.findFirst({
      where: { name: item.name },
      select: { id: true },
    });

    if (existing) {
      await prisma.menuItem.update({
        where: { id: existing.id },
        data: {
          ...item,
          categoryId,
          available: true,
          image,
          customizations,
        },
      });
      continue;
    }

    await prisma.menuItem.create({
      data: {
        ...item,
        categoryId,
        available: true,
        image,
        customizations,
      },
    });
  }

  for (const promo of promoCodes) {
    await prisma.promotionCode.upsert({
      where: { code: promo.code },
      update: {
        ...promo,
      },
      create: {
        ...promo,
      },
    });
  }

  console.log(`Seeded ${items.length} menu items`);
  console.log(`Seeded ${promoCodes.length} promotion codes`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

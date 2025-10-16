const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const [,, nameArg, emailArg, passwordArg] = process.argv;

  const name = nameArg || 'User';
  const email = emailArg;
  const password = passwordArg;

  if (!email || !password) {
    console.error('Usage: node scripts/create_user.js "Name" "email@example.com" "password"');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      }
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, id: user.id, email: user.email }, null, 2));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();



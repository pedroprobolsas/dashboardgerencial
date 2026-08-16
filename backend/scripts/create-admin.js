const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log('\n=== Generador de Usuario Admin Probolsas ===');
  const nombre = await ask('Nombre del administrador: ');
  const email = await ask('Email (login): ');
  
  let password = '';
  while (true) {
    password = await ask('Contraseña (min 8 caracteres, letras y números): ');
    if (password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password)) {
      break;
    }
    console.log('Error: La contraseña debe tener al menos 8 caracteres, e incluir letras y números.\n');
  }

  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);

  const sql = `
INSERT INTO app_ops.usuarios (email, nombre, password_hash, rol, activo, creado_por)
VALUES ('${email}', '${nombre}', '${hash}', 'admin', true, 'Sistema')
ON CONFLICT (email) DO UPDATE 
SET password_hash = EXCLUDED.password_hash, 
    nombre = EXCLUDED.nombre,
    rol = 'admin',
    activo = true;
  `;

  console.log('\n======================================================');
  console.log('Ejecuta la siguiente consulta SQL en tu base de datos:');
  console.log('======================================================\n');
  console.log(sql);
  
  rl.close();
}

main().catch(console.error);

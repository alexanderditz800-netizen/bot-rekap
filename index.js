const { Telegraf, Markup } = require('telegraf');
const bot = new Telegraf('8926215941:AAGbWSRfPCwt5MkpschIWtWdHMJZCMn8IlY');

// Database sederhana
const db = {
  groups: new Map(),
  users: new Map(),
  lastWin: new Map(),
  gameSessions: new Map(),
  transactions: new Map()
};

// Konfigurasi
const DEVELOPER_ID = 8548446244;
const DEVELOPER_USERNAME = '@MasAlexxxxxx';

// Helper functions
const escapeMarkdown = (text) => {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('id-ID').format(amount);
};

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Logger middleware
bot.use((ctx, next) => {
  const username = ctx.from?.username || ctx.from?.first_name || ctx.from?.id;
  console.log(`[${new Date().toISOString()}] ${ctx.updateType} from ${username} in ${ctx.chat?.id || 'PM'}`);
  return next();
});

// Check if user is admin
const isAdmin = async (ctx, userId) => {
  try {
    if (ctx.chat.type === 'private') return true;
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch {
    return false;
  }
};

// Check if group is registered
const isGroupRegistered = (groupId) => {
  return db.groups.has(groupId) && db.groups.get(groupId).registered;
};

// ============ OPEN GAME COMMAND ============

// Open game untuk set LW
bot.command('open', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  if (!await isAdmin(ctx, ctx.from.id)) {
    return ctx.reply('❌ Perintah ini hanya untuk admin.');
  }

  const text = ctx.message.text;
  const lines = text.split('\n').slice(1); // Skip command
  
  let dev = '';
  let rol = '';
  
  lines.forEach(line => {
    if (line.toLowerCase().includes('dev')) {
      dev = line.replace(/DEV\s*:\s*/i, '').trim();
    }
    if (line.toLowerCase().includes('rol')) {
      rol = line.replace(/ROL\s*:\s*/i, '').trim();
    }
  });

  if (!dev || !rol) {
    return ctx.reply(
      `❌ *Format salah!*\n\n` +
      `Cara penggunaan:\n` +
      `/open\n` +
      `DEV : VIVO Y22\n` +
      `ROL : GOOGLE\n\n` +
      `Contoh di atas untuk mengatur Last Win.`,
      { parse_mode: 'Markdown' }
    );
  }

  // Save to lastWin
  db.lastWin.set(ctx.chat.id, {
    dev: dev,
    rol: rol,
    user: ctx.from.username || ctx.from.first_name,
    userId: ctx.from.id,
    date: new Date().toISOString()
  });

  ctx.reply(
    `✅ *Last Win berhasil diatur!*\n\n` +
    `📱 DEV: ${dev}\n` +
    `🎮 ROL: ${rol}\n\n` +
    `Sekarang gunakan /lw untuk melihat detail.`,
    { parse_mode: 'Markdown' }
  );
});

// Last Win command
bot.command('lw', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  const lastWin = db.lastWin.get(ctx.chat.id);
  if (!lastWin) {
    return ctx.reply(
      `ℹ️ *Belum ada Last Win.*\n\n` +
      `Gunakan /open untuk mengatur Last Win:\n` +
      `/open\n` +
      `DEV : VIVO Y22\n` +
      `ROL : GOOGLE`,
      { parse_mode: 'Markdown' }
    );
  }

  ctx.reply(
    `🏆 *LAST WIN*\n\n` +
    `📱 DEV: ${lastWin.dev}\n` +
    `🎮 ROL: ${lastWin.rol}\n` +
    `👤 User: @${lastWin.user}\n` +
    `📅 Tanggal: ${new Date(lastWin.date).toLocaleString('id-ID')}`,
    { parse_mode: 'Markdown' }
  );
});

// ============ REKAP WIN COMMAND ============

// Rekap Win command dengan format baru
bot.command('rekapwin', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ Grup belum terdaftar. Gunakan /start.');
  }

  const replyMsg = ctx.message.reply_to_message;
  if (!replyMsg || !replyMsg.text) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:* Balas pesan yang berisi data game.\n\n` +
      `Contoh format:\n` +
      `GAME 1 : K 2-0 0\n` +
      `GAME 2 : B 1-0 0\n` +
      `GAME 3 : K 2-0 0`,
      { parse_mode: 'Markdown' }
    );
  }

  const lastWin = db.lastWin.get(ctx.chat.id);
  if (!lastWin) {
    return ctx.reply(
      `❌ *Belum ada Last Win!*\n\n` +
      `Gunakan /open untuk mengatur Last Win terlebih dahulu.`,
      { parse_mode: 'Markdown' }
    );
  }

  const text = replyMsg.text;
  const lines = text.split('\n').filter(line => line.trim());
  
  // Parse games
  const games = [];
  let totalK = 0;
  let totalB = 0;
  
  lines.forEach(line => {
    const match = line.match(/GAME\s*(\d+)\s*:\s*([KB])\s*(\d+)-(\d+)\s*(\d+)/i);
    if (match) {
      const gameNum = parseInt(match[1]);
      const team = match[2].toUpperCase();
      const score1 = parseInt(match[3]);
      const score2 = parseInt(match[4]);
      const score3 = parseInt(match[5]);
      
      games.push({
        game: gameNum,
        team: team,
        score1: score1,
        score2: score2,
        score3: score3,
        total: score1 + score2 + score3
      });
      
      if (team === 'K') {
        totalK += score1 + score2 + score3;
      } else {
        totalB += score1 + score2 + score3;
      }
    }
  });

  if (games.length === 0) {
    return ctx.reply(
      `❌ *Format tidak valid!*\n\n` +
      `Format yang benar:\n` +
      `GAME 1 : K 2-0 0\n` +
      `GAME 2 : B 1-0 0\n` +
      `GAME 3 : K 2-0 0`,
      { parse_mode: 'Markdown' }
    );
  }

  // Get user saldo
  const userSaldo = db.users.get(ctx.from.id);
  const saldo = userSaldo ? userSaldo.balance : 0;

  // Format games
  const gamesStr = games.map(g => 
    `GAME ${g.game} : ${g.team} ${g.score1}-${g.score2} ${g.score3}`
  ).join('\n');

  // Build response
  let response = `🏆 *REKAP WIN*\n\n`;
  response += `📱 DEV: ${lastWin.dev}\n`;
  response += `🎮 ROL: ${lastWin.rol}\n\n`;
  response += `👤 LAST WIN : @${lastWin.user}\n`;
  response += `${gamesStr}\n\n`;
  response += `💰 *SALDO PEMAIN : ${formatCurrency(saldo)}*\n\n`;

  // Get all users in group with balance
  const groupData = db.groups.get(ctx.chat.id);
  if (groupData && groupData.users) {
    const userBalances = [];
    for (const [userId, userData] of db.users) {
      if (userData.balance > 0) {
        const user = await ctx.telegram.getChatMember(ctx.chat.id, userId).catch(() => null);
        if (user) {
          const name = user.user.username ? `@${user.user.username}` : user.user.first_name;
          userBalances.push({
            name: name,
            balance: userData.balance
          });
        }
      }
    }
    
    // Sort by balance descending
    userBalances.sort((a, b) => b.balance - a.balance);
    
    // Add top users to response (max 10)
    const topUsers = userBalances.slice(0, 10);
    topUsers.forEach(u => {
      response += `👤 ${u.name} ${formatCurrency(u.balance)}\n`;
    });
    
    if (userBalances.length > 10) {
      response += `\n_dan ${userBalances.length - 10} user lainnya..._`;
    }
  }

  // Add LF users if any
  response += `\n\n📊 *USER LF*`;
  const lfUsers = [];
  for (const [userId, userData] of db.users) {
    if (userData.balance < 0) {
      const user = await ctx.telegram.getChatMember(ctx.chat.id, userId).catch(() => null);
      if (user) {
        const name = user.user.username ? `@${user.user.username}` : user.user.first_name;
        lfUsers.push({
          name: name,
          balance: userData.balance
        });
      }
    }
  }
  
  if (lfUsers.length > 0) {
    lfUsers.forEach(u => {
      response += `\n👤 ${u.name} ${formatCurrency(u.balance)}`;
    });
  } else {
    response += `\n_Tidak ada user LF_`;
  }

  ctx.reply(response, { parse_mode: 'Markdown' });
});

// ============ START COMMAND ============

bot.start(async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply(
      `🎮 *Selamat datang di Bot Rekap!*\n\n` +
      `Bot ini membantu mengelola rekap dan transaksi di grup.\n\n` +
      `📌 *Fitur:*\n` +
      `• Rekap K dan B\n` +
      `• Auto list dari reply\n` +
      `• Last win tracking dengan DEV & ROL\n` +
      `• Deposit & Withdraw\n` +
      `• Balance management\n` +
      `• Anti-link protection\n` +
      `• Tag admin\n\n` +
      `Gunakan /help untuk melihat semua perintah.`,
      { parse_mode: 'Markdown' }
    );
  }

  // Group registration
  const devIsAdmin = await isAdmin(ctx, DEVELOPER_ID);
  if (!devIsAdmin) {
    return ctx.reply(
      `⚠️ *Developer ${DEVELOPER_USERNAME} belum menjadi admin di grup ini!*\n\n` +
      `Admin-kan developer terlebih dahulu untuk mengaktifkan bot.`,
      { parse_mode: 'Markdown' }
    );
  }

  if (!db.groups.has(ctx.chat.id)) {
    db.groups.set(ctx.chat.id, {
      registered: true,
      antilink: false,
      users: {}
    });
  } else {
    db.groups.get(ctx.chat.id).registered = true;
  }

  ctx.reply(
    `✅ *Bot berhasil diaktifkan di grup ini!*\n\n` +
    `Developer: ${DEVELOPER_USERNAME}\n` +
    `Gunakan /help untuk melihat semua perintah.`,
    { parse_mode: 'Markdown' }
  );
});

// ============ HELP COMMAND ============

bot.command('help', (ctx) => {
  const isPM = ctx.chat.type === 'private';
  const commands = [
    ['/start', 'Aktifkan bot di grup atau lihat info di PM'],
    ['/help', 'Tampilkan bantuan ini'],
    ['/rules', 'Lihat peraturan grup'],
    ['/tag', 'Tag semua admin'],
    ['/antilink [on/off]', 'Aktif/nonaktifkan anti-link (admin only)'],
    ['/open', 'Buka game untuk mengatur Last Win (admin only)'],
    ['/lw', 'Lihat Last Win terakhir'],
    ['/rekapwin', 'Rekap win dengan format lengkap'],
    ['/rekap', 'Hitung rekap dari reply pesan'],
    ['/win', 'Hitung winner dari reply pesan'],
    ['/list', 'Auto list dari reply user'],
    ['/depo [jumlah]', 'Deposit saldo (PM only)'],
    ['/wd [jumlah]', 'Withdraw saldo (PM only)'],
    ['/kurangi [jumlah]', 'Kurangi saldo (admin only)'],
    ['/bulatkan', 'Bulatkan saldo ke kelipatan terdekat (PM only)'],
    ['/resetlw', 'Reset last win (admin only)'],
    ['/lunas', 'Tandai transaksi lunas (admin only)'],
    ['/balance', 'Cek saldo (PM only)'],
    ['/contoh', 'Lihat contoh format rekap']
  ];

  let message = `📚 *Daftar Perintah*\n\n`;
  commands.forEach(([cmd, desc]) => {
    if (isPM || !cmd.includes('PM only')) {
      message += `• \`${cmd}\` - ${desc}\n`;
    }
  });

  if (!isPM) {
    message += `\n_Beberapa perintah hanya tersedia di PM._`;
  }

  ctx.reply(message, { parse_mode: 'Markdown' });
});

// ============ RULES COMMAND ============

bot.command('rules', (ctx) => {
  ctx.reply(
    `📝 *PERATURAN GRUP*\n\n` +
    `1. ❌ Dilarang spam\n` +
    `2. 🤝 Sopan terhadap semua anggota\n` +
    `3. 🔗 Tidak mengirim link tanpa izin\n` +
    `4. ✅ Gunakan format yang benar\n` +
    `5. ⛔ Dilarang menggunakan bot untuk hal negatif\n` +
    `6. ❓ Jika ada yang kurang mengerti tanyakan kepada developer\n\n` +
    `Developer: ${DEVELOPER_USERNAME}`,
    { parse_mode: 'Markdown' }
  );
});

// ============ ANTI-LINK ============

bot.command('antilink', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  if (!await isAdmin(ctx, ctx.from.id)) {
    return ctx.reply('❌ Perintah ini hanya untuk admin.');
  }

  const args = ctx.message.text.split(' ')[1];
  if (!args || !['on', 'off'].includes(args.toLowerCase())) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:*\n` +
      `/antilink on - Aktifkan\n` +
      `/antilink off - Nonaktifkan`,
      { parse_mode: 'Markdown' }
    );
  }

  const groupData = db.groups.get(ctx.chat.id);
  if (groupData) {
    groupData.antilink = args.toLowerCase() === 'on';
    ctx.reply(
      `🔗 *Anti-link ${groupData.antilink ? '✅ AKTIF' : '❌ NONAKTIF'}!*`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Anti-link handler
bot.on('message', async (ctx, next) => {
  if (ctx.chat.type === 'private') return next();
  
  const groupData = db.groups.get(ctx.chat.id);
  if (!groupData || !groupData.antilink) return next();

  const msg = ctx.message;
  const text = msg.text || msg.caption || '';
  const isLink = /https?:\/\/\S+|www\.\S+/gi.test(text);
  const isForwarded = msg.forward_from || msg.forward_from_chat;

  if (isLink || isForwarded) {
    try {
      await ctx.deleteMessage();
      await ctx.reply(
        '⚠️ *Link atau status tidak diperbolehkan!*',
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('Gagal menghapus pesan:', err);
    }
  } else {
    return next();
  }
});

// ============ TAG ADMIN ============

bot.command('tag', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  try {
    const admins = await ctx.getChatAdministrators();
    const tags = admins
      .filter(a => !a.user.is_bot)
      .map(a => {
        const name = escapeMarkdown(a.user.username ? `@${a.user.username}` : a.user.first_name);
        return name;
      })
      .join(' ');
    
    ctx.reply(
      `🔔 *Tag Admin:*\n${tags}`,
      { parse_mode: 'MarkdownV2' }
    );
  } catch {
    ctx.reply('❌ Gagal mengambil daftar admin.');
  }
});

// ============ REKAP COMMAND ============

bot.command('rekap', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ Grup belum terdaftar. Gunakan /start.');
  }

  const replyMsg = ctx.message.reply_to_message;
  if (!replyMsg || !replyMsg.text) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:* Balas pesan yang berisi data K dan B.\n\n` +
      `Contoh:\n` +
      `K:\n` +
      `ORANG 100\n` +
      `ORANG 150\n\n` +
      `B:\n` +
      `ORANG 200\n` +
      `ORANG 150`,
      { parse_mode: 'Markdown' }
    );
  }

  const text = replyMsg.text;
  const parse = (section) =>
    [...section.matchAll(/(\w+)\s+(\d+)/g)].map(([, , angka]) => Number(angka));

  const k = text.match(/K:\s*([\s\S]*?)\nB:/i);
  const b = text.match(/B:\s*([\s\S]*)/i);

  const kList = k ? parse(k[1]) : [];
  const bList = b ? parse(b[1]) : [];

  if (kList.length === 0 && bList.length === 0) {
    return ctx.reply('❌ Format tidak valid. Gunakan /contoh untuk melihat format yang benar.');
  }

  const totalK = kList.reduce((a, b) => a + b, 0);
  const totalB = bList.reduce((a, b) => a + b, 0);
  const total = totalK + totalB;

  let selisih = '';
  if (totalK > totalB) {
    selisih = `\n\n🐟 *B masih kurang* [ -${formatCurrency(totalK - totalB)} ]`;
  } else if (totalB > totalK) {
    selisih = `\n\n🐠 *K masih kurang* [ -${formatCurrency(totalB - totalK)} ]`;
  } else {
    selisih = `\n\n✅ *K dan B telah seimbang*`;
  }

  ctx.reply(
    `📊 *REKAP*\n\n` +
    `🔵 *K:* [${kList.join(', ')}] = ${formatCurrency(totalK)}\n\n` +
    `🔵 *B:* [${bList.join(', ')}] = ${formatCurrency(totalB)}${selisih}\n\n` +
    `💰 *Total Saldo:* ${formatCurrency(total)} K`,
    { parse_mode: 'Markdown' }
  );
});

// ============ WIN COMMAND ============

bot.command('win', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ Grup belum terdaftar. Gunakan /start.');
  }

  const replyMsg = ctx.message.reply_to_message;
  if (!replyMsg || !replyMsg.text) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:* Balas pesan yang berisi data K dan B.\n\n` +
      `Contoh:\n` +
      `K:\n` +
      `ORANG 100 lf\n` +
      `ORANG 150\n\n` +
      `B:\n` +
      `ORANG 200\n` +
      `ORANG 150 lf`,
      { parse_mode: 'Markdown' }
    );
  }

  const text = replyMsg.text;
  const parse = (section) => {
    return [...section.matchAll(/(\w+)\s+(\d+)(\s*lf)?/gi)].map(([, nama, angkaStr, lfFlag]) => {
      const angka = parseInt(angkaStr);
      const isLf = !!lfFlag;
      const fee = Math.floor((angka - 1) / 10) + 1;
      const total = isLf ? angka - fee : angka + angka - fee;
      return { nama, angka, total, isLf };
    });
  };

  const k = text.match(/K:\s*([\s\S]*?)\nB:/i);
  const b = text.match(/B:\s*([\s\S]*)/i);

  const kList = k ? parse(k[1]) : [];
  const bList = b ? parse(b[1]) : [];

  if (kList.length === 0 && bList.length === 0) {
    return ctx.reply('❌ Format tidak valid. Gunakan /contoh untuk melihat format yang benar.');
  }

  const formatList = (list) =>
    list.map(u => `${u.nama} ${u.angka} // ${u.total}${u.isLf ? ' lf' : ''}`).join('\n');

  ctx.reply(
    `🏆 *WINNER*\n\n` +
    `*K:*\n${formatList(kList)}\n\n` +
    `*B:*\n${formatList(bList)}`,
    { parse_mode: 'Markdown' }
  );
});

// ============ LIST COMMAND ============

bot.command('list', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  const replyMsg = ctx.message.reply_to_message;
  if (!replyMsg || !replyMsg.text) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:* Balas pesan user yang berisi list.\n\n` +
      `Contoh:\n` +
      `ORANG 100\n` +
      `ORANG 150\n` +
      `ORANG 200`,
      { parse_mode: 'Markdown' }
    );
  }

  const text = replyMsg.text;
  const items = text.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const match = line.match(/^(\w+)\s+(\d+)$/);
      if (match) {
        return { name: match[1], amount: parseInt(match[2]) };
      }
      return null;
    })
    .filter(item => item !== null);

  if (items.length === 0) {
    return ctx.reply('❌ Format tidak valid. Format yang benar: NAMA JUMLAH');
  }

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const listStr = items.map((item, index) => 
    `${index + 1}. ${item.name} - ${formatCurrency(item.amount)}`
  ).join('\n');

  ctx.reply(
    `📋 *LIST*\n\n` +
    `${listStr}\n\n` +
    `📊 *Total:* ${formatCurrency(total)}`,
    { parse_mode: 'Markdown' }
  );
});

// ============ RESET LW ============

bot.command('resetlw', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  if (!await isAdmin(ctx, ctx.from.id)) {
    return ctx.reply('❌ Perintah ini hanya untuk admin.');
  }

  db.lastWin.delete(ctx.chat.id);
  ctx.reply('✅ *Last win berhasil direset!*', { parse_mode: 'Markdown' });
});

// ============ BALANCE COMMANDS ============

bot.command('balance', (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('❌ Perintah ini hanya di PM.');
  }

  const userData = db.users.get(ctx.from.id) || { balance: 0 };
  ctx.reply(
    `💰 *SALDO ANDA*\n\n` +
    `Balance: ${formatCurrency(userData.balance)} K\n\n` +
    `📌 Gunakan /depo [jumlah] untuk deposit\n` +
    `📌 Gunakan /wd [jumlah] untuk withdraw`,
    { parse_mode: 'Markdown' }
  );
});

// ============ DEPOSIT ============

bot.command('depo', async (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('❌ Perintah ini hanya di PM.');
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 2 || isNaN(args[1]) || parseInt(args[1]) <= 0) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:* /depo [jumlah]\n\n` +
      `Contoh: /depo 100000`,
      { parse_mode: 'Markdown' }
    );
  }

  const amount = parseInt(args[1]);
  const userId = ctx.from.id;
  
  if (!db.users.has(userId)) {
    db.users.set(userId, { balance: 0, wins: [], deposits: [], withdrawals: [] });
  }
  
  const userData = db.users.get(userId);
  userData.balance += amount;
  userData.deposits = userData.deposits || [];
  userData.deposits.push({
    amount,
    date: new Date().toISOString(),
    id: generateId()
  });

  ctx.reply(
    `✅ *Deposit berhasil!*\n\n` +
    `💰 Jumlah: ${formatCurrency(amount)} K\n` +
    `💳 Saldo baru: ${formatCurrency(userData.balance)} K`,
    { parse_mode: 'Markdown' }
  );
});

// ============ WITHDRAW ============

bot.command('wd', async (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('❌ Perintah ini hanya di PM.');
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 2 || isNaN(args[1]) || parseInt(args[1]) <= 0) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:* /wd [jumlah]\n\n` +
      `Contoh: /wd 50000`,
      { parse_mode: 'Markdown' }
    );
  }

  const amount = parseInt(args[1]);
  const userId = ctx.from.id;
  
  if (!db.users.has(userId)) {
    return ctx.reply('❌ Anda belum memiliki saldo.');
  }

  const userData = db.users.get(userId);
  if (userData.balance < amount) {
    return ctx.reply(
      `❌ *Saldo tidak mencukupi!*\n\n` +
      `Saldo Anda: ${formatCurrency(userData.balance)} K\n` +
      `Jumlah yang diminta: ${formatCurrency(amount)} K`,
      { parse_mode: 'Markdown' }
    );
  }

  userData.balance -= amount;
  userData.withdrawals = userData.withdrawals || [];
  userData.withdrawals.push({
    amount,
    date: new Date().toISOString(),
    id: generateId()
  });

  ctx.reply(
    `✅ *Withdraw berhasil!*\n\n` +
    `💰 Jumlah: ${formatCurrency(amount)} K\n` +
    `💳 Saldo baru: ${formatCurrency(userData.balance)} K\n\n` +
    `📌 Transaksi akan diproses oleh admin.`,
    { parse_mode: 'Markdown' }
  );
});

// ============ KURANGI ============

bot.command('kurangi', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  if (!await isAdmin(ctx, ctx.from.id)) {
    return ctx.reply('❌ Perintah ini hanya untuk admin.');
  }

  const replyMsg = ctx.message.reply_to_message;
  if (!replyMsg || !replyMsg.from) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:* Balas pesan user dan tulis /kurangi [jumlah]\n\n` +
      `Contoh: /kurangi 10000`,
      { parse_mode: 'Markdown' }
    );
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 2 || isNaN(args[1]) || parseInt(args[1]) <= 0) {
    return ctx.reply('❌ Masukkan jumlah yang valid.');
  }

  const amount = parseInt(args[1]);
  const userId = replyMsg.from.id;
  
  if (!db.users.has(userId)) {
    return ctx.reply('❌ User belum memiliki saldo.');
  }

  const userData = db.users.get(userId);
  if (userData.balance < amount) {
    return ctx.reply(
      `❌ *Saldo user tidak mencukupi!*\n\n` +
      `Saldo: ${formatCurrency(userData.balance)} K\n` +
      `Jumlah yang diminta: ${formatCurrency(amount)} K`,
      { parse_mode: 'Markdown' }
    );
  }

  userData.balance -= amount;
  ctx.reply(
    `✅ *Saldo berhasil dikurangi!*\n\n` +
    `👤 User: ${replyMsg.from.first_name}\n` +
    `💰 Jumlah: ${formatCurrency(amount)} K\n` +
    `💳 Saldo baru: ${formatCurrency(userData.balance)} K`,
    { parse_mode: 'Markdown' }
  );
});

// ============ BULATKAN ============

bot.command('bulatkan', async (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('❌ Perintah ini hanya di PM.');
  }

  const userId = ctx.from.id;
  if (!db.users.has(userId)) {
    return ctx.reply('❌ Anda belum memiliki saldo.');
  }

  const userData = db.users.get(userId);
  const balance = userData.balance;
  const rounded = Math.ceil(balance / 1000) * 1000;
  const difference = rounded - balance;

  if (difference === 0) {
    return ctx.reply(
      `✅ *Saldo sudah bulat!*\n\n` +
      `Saldo: ${formatCurrency(balance)} K`,
      { parse_mode: 'Markdown' }
    );
  }

  userData.balance = rounded;
  ctx.reply(
    `✅ *Saldo berhasil dibulatkan!*\n\n` +
    `💰 Saldo lama: ${formatCurrency(balance)} K\n` +
    `💰 Saldo baru: ${formatCurrency(rounded)} K\n` +
    `📈 Selisih: ${formatCurrency(difference)} K`,
    { parse_mode: 'Markdown' }
  );
});

// ============ LUNAS ============

bot.command('lunas', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  if (!await isAdmin(ctx, ctx.from.id)) {
    return ctx.reply('❌ Perintah ini hanya untuk admin.');
  }

  const replyMsg = ctx.message.reply_to_message;
  if (!replyMsg || !replyMsg.from) {
    return ctx.reply('ℹ️ Balas pesan user untuk menandai lunas.');
  }

  const userId = replyMsg.from.id;
  const userData = db.users.get(userId);
  
  if (!userData) {
    return ctx.reply('❌ User belum memiliki data.');
  }

  const lastTransaction = userData.withdrawals?.[userData.withdrawals.length - 1];
  if (!lastTransaction) {
    return ctx.reply('❌ User tidak memiliki transaksi withdraw.');
  }

  lastTransaction.status = 'lunas';
  ctx.reply(
    `✅ *Transaksi ditandai lunas!*\n\n` +
    `👤 User: ${replyMsg.from.first_name}\n` +
    `💰 Jumlah: ${formatCurrency(lastTransaction.amount)} K\n` +
    `📅 Tanggal: ${new Date(lastTransaction.date).toLocaleString('id-ID')}`,
    { parse_mode: 'Markdown' }
  );
});

// ============ CONTOH ============

bot.command('contoh', (ctx) => {
  ctx.reply(
    `📝 *CONTOH FORMAT*\n\n` +
    `*Untuk /open:*\n` +
    `/open\n` +
    `DEV : VIVO Y22\n` +
    `ROL : GOOGLE\n\n` +
    `*Untuk /rekapwin:*\n` +
    `GAME 1 : K 2-0 0\n` +
    `GAME 2 : B 1-0 0\n` +
    `GAME 3 : K 2-0 0\n\n` +
    `*Untuk /rekap:*\n` +
    `K:\n` +
    `ORANG 100\n` +
    `ORANG 150\n\n` +
    `B:\n` +
    `ORANG 200\n` +
    `ORANG 150\n\n` +
    `*Untuk /win:*\n` +
    `K:\n` +
    `ORANG 100 lf\n` +
    `ORANG 150\n\n` +
    `B:\n` +
    `ORANG 200\n` +
    `ORANG 150 lf\n\n` +
    `📌 *Keterangan:*\n` +
    `• lf = Lebih Fee\n` +
    `• Format: NAMA JUMLAH (opsional: lf)\n` +
    `• Minimal 1 item per list`,
    { parse_mode: 'Markdown' }
  );
});

// ============ ERROR HANDLING ============

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.').catch(() => {});
});

// ============ LAUNCH BOT ============

bot.launch()
  .then(() => {
    console.log('🤖 Bot Rekap aktif dan berjalan...');
    console.log(`👤 Developer: ${DEVELOPER_USERNAME} (ID: ${DEVELOPER_ID})`);
    console.log('📊 Database siap digunakan');
  })
  .catch((err) => {
    console.error('Gagal menjalankan bot:', err);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
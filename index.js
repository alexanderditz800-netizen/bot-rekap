const { Telegraf, Markup } = require('telegraf');
const bot = new Telegraf('8926215941:AAGbWSRfPCwt5MkpschIWtWdHMJZCMn8IlY');

// Database
const db = {
  groups: new Map(),
  users: new Map(),
  lastWin: new Map(),
  gameSessions: new Map(),
  transactions: new Map(),
  pendingRekap: new Map()
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

// Logger
bot.use((ctx, next) => {
  const username = ctx.from?.username || ctx.from?.first_name || ctx.from?.id;
  console.log(`[${new Date().toISOString()}] ${ctx.updateType} from ${username} in ${ctx.chat?.id || 'PM'}`);
  return next();
});

// Check admin
const isAdmin = async (ctx, userId) => {
  try {
    if (ctx.chat.type === 'private') return true;
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch {
    return false;
  }
};

// Check group registered
const isGroupRegistered = (groupId) => {
  return db.groups.has(groupId) && db.groups.get(groupId).registered;
};

// Middleware untuk cek admin di SEMUA perintah grup
const groupAdminOnly = async (ctx, next) => {
  if (ctx.chat.type === 'private') {
    return next();
  }
  
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }
  return next();
};

// Middleware untuk cek registered group
const groupRegistered = async (ctx, next) => {
  if (ctx.chat.type === 'private') {
    return next();
  }
  
  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
  }
  return next();
};

// Get user from mention or reply
const getTargetUser = async (ctx, mention) => {
  try {
    // Jika ada mention @username
    if (mention && mention.startsWith('@')) {
      const username = mention.replace('@', '');
      const members = await ctx.telegram.getChatMembersCount(ctx.chat.id);
      // Cari user dengan username
      const chatMembers = await ctx.telegram.getChatAdministrators(ctx.chat.id);
      for (const member of chatMembers) {
        if (member.user.username === username) {
          return member.user;
        }
      }
      // Jika tidak ditemukan di admin, coba cari di semua member (limited)
      return null;
    }
    
    // Jika reply ke pesan
    if (ctx.message.reply_to_message) {
      return ctx.message.reply_to_message.from;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting target user:', error);
    return null;
  }
};

// Parse mention to get user ID
const parseMention = async (ctx, text) => {
  // Cek apakah ada mention @username
  const mentionMatch = text.match(/@(\w+)/);
  if (mentionMatch) {
    const username = mentionMatch[1];
    try {
      // Coba cari user dari mention
      const chatMembers = await ctx.telegram.getChatAdministrators(ctx.chat.id);
      for (const member of chatMembers) {
        if (member.user.username === username) {
          return {
            id: member.user.id,
            username: member.user.username,
            first_name: member.user.first_name
          };
        }
      }
    } catch (error) {
      console.error('Error finding user by mention:', error);
    }
  }
  
  // Jika tidak ada mention, coba dari reply
  if (ctx.message.reply_to_message) {
    return {
      id: ctx.message.reply_to_message.from.id,
      username: ctx.message.reply_to_message.from.username,
      first_name: ctx.message.reply_to_message.from.first_name
    };
  }
  
  return null;
};

// Update user balance
const updateUserBalance = (userId, amount) => {
  if (!db.users.has(userId)) {
    db.users.set(userId, { balance: 0, wins: [], deposits: [], withdrawals: [] });
  }
  const userData = db.users.get(userId);
  userData.balance += amount;
  return userData;
};

// ============ ALL GROUP COMMANDS - ADMIN ONLY ============

// START
bot.start(async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply(
      `🎮 *Selamat datang di Bot Rekap!*\n\n` +
      `Bot ini membantu mengelola rekap dan transaksi di grup.\n\n` +
      `📌 *Fitur:*\n` +
      `• Rekap K dan B dengan total otomatis\n` +
      `• Rekap Win dengan pilihan kecil/besar\n` +
      `• Last win tracking dengan DEV & ROL\n` +
      `• Auto update saldo user\n` +
      `• Deposit & Withdraw\n` +
      `• Balance management\n` +
      `• Anti-link protection\n\n` +
      `Gunakan /help untuk melihat semua perintah.`,
      { parse_mode: 'Markdown' }
    );
  }

  // START di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

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

// HELP
bot.command('help', async (ctx) => {
  if (ctx.chat.type === 'private') {
    const commands = [
      ['/start', 'Aktifkan bot di grup atau lihat info di PM'],
      ['/help', 'Tampilkan bantuan ini'],
      ['/balance', 'Cek saldo (PM only)'],
      ['/contoh', 'Lihat contoh format rekap']
    ];

    let message = `📚 *Daftar Perintah (PM)*\n\n`;
    commands.forEach(([cmd, desc]) => {
      message += `• \`${cmd}\` - ${desc}\n`;
    });
    
    message += `\n📌 *Untuk perintah grup, hanya admin yang bisa menggunakan.*`;
    
    return ctx.reply(message, { parse_mode: 'Markdown' });
  }

  // HELP di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  const commands = [
    ['/start', 'Aktifkan bot di grup'],
    ['/help', 'Tampilkan bantuan ini'],
    ['/rules', 'Lihat peraturan grup'],
    ['/tag', 'Tag semua admin'],
    ['/antilink [on/off]', 'Aktif/nonaktifkan anti-link'],
    ['/open', 'Buka game untuk mengatur Last Win'],
    ['/lw', 'Lihat Last Win terakhir'],
    ['/rekap', 'Rekap K dan B dari reply pesan'],
    ['/rekapwin', 'Rekap win dengan pilihan kecil/besar'],
    ['/win', 'Hitung winner dari reply pesan'],
    ['/list', 'Auto list dari reply user'],
    ['/depo [@user] [jumlah]', 'Deposit saldo ke user (reply atau mention)'],
    ['/kurangi [@user] [jumlah]', 'Kurangi saldo user (reply atau mention)'],
    ['/lunas [@user]', 'Tandai transaksi lunas (reply atau mention)'],
    ['/resetlw', 'Reset last win'],
    ['/contoh', 'Lihat contoh format rekap']
  ];

  let message = `📚 *Daftar Perintah (Grup - Admin Only)*\n\n`;
  commands.forEach(([cmd, desc]) => {
    message += `• \`${cmd}\` - ${desc}\n`;
  });

  ctx.reply(message, { parse_mode: 'Markdown' });
});

// RULES
bot.command('rules', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // RULES di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

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

// TAG
bot.command('tag', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // TAG di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
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

// ANTILINK
bot.command('antilink', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // ANTILINK di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
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

// OPEN
bot.command('open', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // OPEN di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
  }

  const text = ctx.message.text;
  const lines = text.split('\n').slice(1);
  
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

// LW
bot.command('lw', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // LW di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
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

// REKAP
bot.command('rekap', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // REKAP di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
  }

  const replyMsg = ctx.message.reply_to_message;
  if (!replyMsg || !replyMsg.text) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:* Balas pesan yang berisi data K dan B.\n\n` +
      `Contoh:\n` +
      `K :\n` +
      `asisi 6200\n` +
      `beni 7000\n\n` +
      `B :\n` +
      `aleh 12000\n` +
      `asek 1200`,
      { parse_mode: 'Markdown' }
    );
  }

  const text = replyMsg.text;
  
  // Parse K
  const kMatch = text.match(/K\s*:\s*([\s\S]*?)(?=\n\s*B\s*:|$)/i);
  const bMatch = text.match(/B\s*:\s*([\s\S]*)/i);
  
  const parseList = (section) => {
    if (!section) return [];
    return section.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const match = line.match(/^(\w+)\s+(\d+)$/);
        if (match) {
          return { name: match[1], amount: parseInt(match[2]) };
        }
        return null;
      })
      .filter(item => item !== null);
  };

  const kList = kMatch ? parseList(kMatch[1]) : [];
  const bList = bMatch ? parseList(bMatch[1]) : [];

  if (kList.length === 0 && bList.length === 0) {
    return ctx.reply('❌ Format tidak valid. Gunakan /contoh untuk melihat format yang benar.');
  }

  const totalK = kList.reduce((sum, item) => sum + item.amount, 0);
  const totalB = bList.reduce((sum, item) => sum + item.amount, 0);
  const totalAll = totalK + totalB;

  let selisih = '';
  if (totalK > totalB) {
    selisih = `\n\n🐟 *B masih kurang* [ -${formatCurrency(totalK - totalB)} ]`;
  } else if (totalB > totalK) {
    selisih = `\n\n🐠 *K masih kurang* [ -${formatCurrency(totalB - totalK)} ]`;
  } else {
    selisih = `\n\n✅ *K dan B telah seimbang*`;
  }

  const kStr = kList.map(item => `${item.name} ${formatCurrency(item.amount)}`).join(', ');
  const bStr = bList.map(item => `${item.name} ${formatCurrency(item.amount)}`).join(', ');

  ctx.reply(
    `📊 *REKAP*\n\n` +
    `🔵 *K:* [${kStr}] = ${formatCurrency(totalK)}\n\n` +
    `🔵 *B:* [${bStr}] = ${formatCurrency(totalB)}${selisih}\n\n` +
    `💰 *Total Saldo:* ${formatCurrency(totalAll)} K`,
    { parse_mode: 'Markdown' }
  );
});

// REKAPWIN
bot.command('rekapwin', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // REKAPWIN di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
  }

  const lastWin = db.lastWin.get(ctx.chat.id);
  if (!lastWin) {
    return ctx.reply(
      `❌ *Belum ada Last Win!*\n\n` +
      `Gunakan /open untuk mengatur Last Win terlebih dahulu.`,
      { parse_mode: 'Markdown' }
    );
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

  const text = replyMsg.text;
  const lines = text.split('\n').filter(line => line.trim());
  
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

  // Simpan data untuk pilihan win
  const sessionId = generateId();
  db.pendingRekap.set(sessionId, {
    groupId: ctx.chat.id,
    userId: ctx.from.id,
    games: games,
    totalK: totalK,
    totalB: totalB,
    lastWin: lastWin,
    timestamp: Date.now()
  });

  const gamesStr = games.map(g => 
    `GAME ${g.game} : ${g.team} ${g.score1}-${g.score2} ${g.score3}`
  ).join('\n');

  const inlineKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🏆 WIN KECIL', `win_small_${sessionId}`),
      Markup.button.callback('🏆 WIN BESAR', `win_big_${sessionId}`)
    ],
    [
      Markup.button.callback('❌ Batal', `win_cancel_${sessionId}`)
    ]
  ]);

  ctx.reply(
    `🎮 *PILIH JENIS WIN*\n\n` +
    `📱 DEV: ${lastWin.dev}\n` +
    `🎮 ROL: ${lastWin.rol}\n\n` +
    `📊 *Data Game:*\n${gamesStr}\n\n` +
    `🔵 Total K: ${formatCurrency(totalK)}\n` +
    `🔵 Total B: ${formatCurrency(totalB)}\n\n` +
    `Pilih jenis win yang diinginkan:`,
    {
      parse_mode: 'Markdown',
      ...inlineKeyboard
    }
  );
});

// ============ CALLBACK QUERY HANDLER ============
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const sessionId = data.split('_').slice(2).join('_');
  const pendingData = db.pendingRekap.get(sessionId);
  
  if (!pendingData) {
    return ctx.answerCbQuery('❌ Sesi sudah kadaluarsa!', { show_alert: true });
  }

  if (data.startsWith('win_small_')) {
    await handleWinSelection(ctx, pendingData, 'kecil');
  } else if (data.startsWith('win_big_')) {
    await handleWinSelection(ctx, pendingData, 'besar');
  } else if (data.startsWith('win_cancel_')) {
    db.pendingRekap.delete(sessionId);
    await ctx.deleteMessage();
    await ctx.answerCbQuery('✅ Rekap dibatalkan.');
  }
});

async function handleWinSelection(ctx, pendingData, type) {
  const { groupId, games, totalK, totalB, lastWin } = pendingData;
  
  // Update saldo user berdasarkan win
  const multiplier = type === 'kecil' ? 0.1 : 0.25;
  const winAmount = Math.floor((totalK + totalB) * multiplier);
  
  // Update saldo user
  const userData = updateUserBalance(ctx.from.id, winAmount);
  
  // Update last win
  db.lastWin.set(groupId, {
    ...lastWin,
    winType: type,
    winAmount: winAmount,
    games: games,
    totalK: totalK,
    totalB: totalB,
    updatedAt: new Date().toISOString()
  });

  // Get all users in group with balance
  const groupData = db.groups.get(groupId);
  const userBalances = [];
  const lfUsers = [];
  
  for (const [userId, userData] of db.users) {
    if (userData.balance > 0) {
      const user = await ctx.telegram.getChatMember(groupId, userId).catch(() => null);
      if (user) {
        const name = user.user.username ? `@${user.user.username}` : user.user.first_name;
        userBalances.push({
          name: name,
          balance: userData.balance
        });
      }
    } else if (userData.balance < 0) {
      const user = await ctx.telegram.getChatMember(groupId, userId).catch(() => null);
      if (user) {
        const name = user.user.username ? `@${user.user.username}` : user.user.first_name;
        lfUsers.push({
          name: name,
          balance: userData.balance
        });
      }
    }
  }
  
  userBalances.sort((a, b) => b.balance - a.balance);
  
  // Build response
  const gamesStr = games.map(g => 
    `GAME ${g.game} : ${g.team} ${g.score1}-${g.score2} ${g.score3}`
  ).join('\n');
  
  let response = `🏆 *REKAP WIN ${type.toUpperCase()}*\n\n`;
  response += `📱 DEV: ${lastWin.dev}\n`;
  response += `🎮 ROL: ${lastWin.rol}\n\n`;
  response += `👤 LAST WIN : @${lastWin.user}\n`;
  response += `${gamesStr}\n\n`;
  response += `💰 *SALDO PEMAIN : ${formatCurrency(userData.balance)}*\n\n`;
  response += `📊 *DAFTAR SALDO USER:*\n`;
  
  const topUsers = userBalances.slice(0, 10);
  topUsers.forEach(u => {
    response += `👤 ${u.name} ${formatCurrency(u.balance)}\n`;
  });
  
  if (userBalances.length > 10) {
    response += `\n_dan ${userBalances.length - 10} user lainnya..._`;
  }
  
  response += `\n\n📊 *USER LF:*\n`;
  if (lfUsers.length > 0) {
    lfUsers.forEach(u => {
      response += `👤 ${u.name} ${formatCurrency(u.balance)}\n`;
    });
  } else {
    response += `_Tidak ada user LF_`;
  }
  
  response += `\n\n✅ *Win ${type} berhasil!*\n`;
  response += `💰 Bonus: ${formatCurrency(winAmount)} K`;

  // Delete original message
  await ctx.deleteMessage();
  
  // Send result
  await ctx.telegram.sendMessage(groupId, response, { parse_mode: 'Markdown' });
  
  // Delete pending data
  db.pendingRekap.delete(sessionId);
  
  await ctx.answerCbQuery(`✅ Win ${type} berhasil diproses!`);
}

// WIN
bot.command('win', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // WIN di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
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

// LIST
bot.command('list', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // LIST di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
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

// ============ DEPOSIT (ADMIN ONLY) ============
bot.command('depo', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // DEPO di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  
  // Format: /depo @username 10000 atau /depo 10000 (dengan reply)
  let targetUser = null;
  let amount = 0;
  
  // Cek apakah ada mention
  const mentionMatch = ctx.message.text.match(/@(\w+)/);
  if (mentionMatch) {
    const username = mentionMatch[1];
    try {
      const chatMembers = await ctx.telegram.getChatAdministrators(ctx.chat.id);
      for (const member of chatMembers) {
        if (member.user.username === username) {
          targetUser = member.user;
          break;
        }
      }
    } catch (error) {
      console.error('Error finding user:', error);
    }
  }
  
  // Jika tidak ada mention, cek reply
  if (!targetUser && ctx.message.reply_to_message) {
    targetUser = ctx.message.reply_to_message.from;
  }
  
  if (!targetUser) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:*\n` +
      `1. Reply pesan user: /depo [jumlah]\n` +
      `2. Mention user: /depo @username [jumlah]\n\n` +
      `Contoh: /depo @MasAlexxxxxx 100000`,
      { parse_mode: 'Markdown' }
    );
  }

  // Ambil jumlah dari args
  const amountStr = args.find(arg => !arg.startsWith('@') && !arg.startsWith('/depo') && !isNaN(arg));
  if (!amountStr || parseInt(amountStr) <= 0) {
    return ctx.reply(
      `❌ *Masukkan jumlah yang valid!*\n\n` +
      `Contoh: /depo @username 100000`,
      { parse_mode: 'Markdown' }
    );
  }
  
  amount = parseInt(amountStr);

  // Update balance
  const userData = updateUserBalance(targetUser.id, amount);
  userData.deposits = userData.deposits || [];
  userData.deposits.push({
    amount: amount,
    date: new Date().toISOString(),
    id: generateId(),
    admin: ctx.from.id
  });

  const targetName = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
  
  ctx.reply(
    `✅ *Deposit berhasil!*\n\n` +
    `👤 User: ${targetName}\n` +
    `💰 Jumlah: ${formatCurrency(amount)} K\n` +
    `💳 Saldo baru: ${formatCurrency(userData.balance)} K\n` +
    `👤 Admin: ${ctx.from.first_name}`,
    { parse_mode: 'Markdown' }
  );
});

// ============ KURANGI (ADMIN ONLY) ============
bot.command('kurangi', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // KURANGI di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  
  let targetUser = null;
  let amount = 0;
  
  // Cek mention
  const mentionMatch = ctx.message.text.match(/@(\w+)/);
  if (mentionMatch) {
    const username = mentionMatch[1];
    try {
      const chatMembers = await ctx.telegram.getChatAdministrators(ctx.chat.id);
      for (const member of chatMembers) {
        if (member.user.username === username) {
          targetUser = member.user;
          break;
        }
      }
    } catch (error) {
      console.error('Error finding user:', error);
    }
  }
  
  // Jika tidak ada mention, cek reply
  if (!targetUser && ctx.message.reply_to_message) {
    targetUser = ctx.message.reply_to_message.from;
  }
  
  if (!targetUser) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:*\n` +
      `1. Reply pesan user: /kurangi [jumlah]\n` +
      `2. Mention user: /kurangi @username [jumlah]\n\n` +
      `Contoh: /kurangi @MasAlexxxxxx 100000`,
      { parse_mode: 'Markdown' }
    );
  }

  // Ambil jumlah
  const amountStr = args.find(arg => !arg.startsWith('@') && !arg.startsWith('/kurangi') && !isNaN(arg));
  if (!amountStr || parseInt(amountStr) <= 0) {
    return ctx.reply(
      `❌ *Masukkan jumlah yang valid!*\n\n` +
      `Contoh: /kurangi @username 100000`,
      { parse_mode: 'Markdown' }
    );
  }
  
  amount = parseInt(amountStr);

  if (!db.users.has(targetUser.id)) {
    return ctx.reply('❌ User belum memiliki saldo.');
  }

  const userData = db.users.get(targetUser.id);
  if (userData.balance < amount) {
    return ctx.reply(
      `❌ *Saldo user tidak mencukupi!*\n\n` +
      `Saldo: ${formatCurrency(userData.balance)} K\n` +
      `Jumlah yang diminta: ${formatCurrency(amount)} K`,
      { parse_mode: 'Markdown' }
    );
  }

  userData.balance -= amount;
  
  const targetName = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
  
  ctx.reply(
    `✅ *Saldo berhasil dikurangi!*\n\n` +
    `👤 User: ${targetName}\n` +
    `💰 Jumlah: ${formatCurrency(amount)} K\n` +
    `💳 Saldo baru: ${formatCurrency(userData.balance)} K\n` +
    `👤 Admin: ${ctx.from.first_name}`,
    { parse_mode: 'Markdown' }
  );
});

// ============ LUNAS (ADMIN ONLY) ============
bot.command('lunas', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // LUNAS di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
  }

  let targetUser = null;
  
  // Cek mention
  const mentionMatch = ctx.message.text.match(/@(\w+)/);
  if (mentionMatch) {
    const username = mentionMatch[1];
    try {
      const chatMembers = await ctx.telegram.getChatAdministrators(ctx.chat.id);
      for (const member of chatMembers) {
        if (member.user.username === username) {
          targetUser = member.user;
          break;
        }
      }
    } catch (error) {
      console.error('Error finding user:', error);
    }
  }
  
  // Jika tidak ada mention, cek reply
  if (!targetUser && ctx.message.reply_to_message) {
    targetUser = ctx.message.reply_to_message.from;
  }
  
  if (!targetUser) {
    return ctx.reply(
      `ℹ️ *Cara penggunaan:*\n` +
      `1. Reply pesan user: /lunas\n` +
      `2. Mention user: /lunas @username\n\n` +
      `Contoh: /lunas @MasAlexxxxxx`,
      { parse_mode: 'Markdown' }
    );
  }

  const userId = targetUser.id;
  const userData = db.users.get(userId);
  
  if (!userData) {
    return ctx.reply('❌ User belum memiliki data.');
  }

  const lastTransaction = userData.withdrawals?.[userData.withdrawals.length - 1];
  if (!lastTransaction) {
    return ctx.reply('❌ User tidak memiliki transaksi withdraw.');
  }

  lastTransaction.status = 'lunas';
  lastTransaction.lunasBy = ctx.from.id;
  lastTransaction.lunasDate = new Date().toISOString();
  
  const targetName = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
  
  ctx.reply(
    `✅ *Transaksi ditandai lunas!*\n\n` +
    `👤 User: ${targetName}\n` +
    `💰 Jumlah: ${formatCurrency(lastTransaction.amount)} K\n` +
    `📅 Tanggal: ${new Date(lastTransaction.date).toLocaleString('id-ID')}\n` +
    `👤 Admin: ${ctx.from.first_name}`,
    { parse_mode: 'Markdown' }
  );
});

// RESETLW
bot.command('resetlw', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ Perintah ini hanya untuk grup.');
  }

  // RESETLW di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  if (!isGroupRegistered(ctx.chat.id)) {
    return ctx.reply('❌ *Grup belum terdaftar!*\nGunakan /start untuk mendaftarkan grup.', { parse_mode: 'Markdown' });
  }

  db.lastWin.delete(ctx.chat.id);
  ctx.reply('✅ *Last win berhasil direset!*', { parse_mode: 'Markdown' });
});

// CONTOH
bot.command('contoh', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply(
      `📝 *CONTOH FORMAT*\n\n` +
      `*Untuk /rekap:*\n` +
      `K :\n` +
      `asisi 6200\n` +
      `beni 7000\n\n` +
      `B :\n` +
      `aleh 12000\n` +
      `asek 1200\n\n` +
      `*Untuk /rekapwin:*\n` +
      `GAME 1 : K 2-0 0\n` +
      `GAME 2 : B 1-0 0\n` +
      `GAME 3 : K 2-0 0\n\n` +
      `*Untuk /win:*\n` +
      `K:\n` +
      `ORANG 100 lf\n` +
      `ORANG 150\n\n` +
      `B:\n` +
      `ORANG 200\n` +
      `ORANG 150 lf\n\n` +
      `*Untuk /depo:*\n` +
      `/depo @username 100000\n` +
      `atau reply pesan user: /depo 100000\n\n` +
      `*Untuk /kurangi:*\n` +
      `/kurangi @username 50000\n` +
      `atau reply pesan user: /kurangi 50000\n\n` +
      `*Untuk /lunas:*\n` +
      `/lunas @username\n` +
      `atau reply pesan user: /lunas\n\n` +
      `📌 *Keterangan:*\n` +
      `• lf = Lebih Fee\n` +
      `• Format: NAMA JUMLAH (opsional: lf)`,
      { parse_mode: 'Markdown' }
    );
  }

  // CONTOH di grup - ADMIN ONLY
  const isUserAdmin = await isAdmin(ctx, ctx.from.id);
  if (!isUserAdmin) {
    return ctx.reply('❌ *Maaf, perintah ini hanya untuk admin grup!*', { parse_mode: 'Markdown' });
  }

  ctx.reply(
    `📝 *CONTOH FORMAT*\n\n` +
    `*Untuk /rekap:*\n` +
    `K :\n` +
    `asisi 6200\n` +
    `beni 7000\n\n` +
    `B :\n` +
    `aleh 12000\n` +
    `asek 1200\n\n` +
    `*Untuk /rekapwin:*\n` +
    `GAME 1 : K 2-0 0\n` +
    `GAME 2 : B 1-0 0\n` +
    `GAME 3 : K 2-0 0\n\n` +
    `*Untuk /win:*\n` +
    `K:\n` +
    `ORANG 100 lf\n` +
    `ORANG 150\n\n` +
    `B:\n` +
    `ORANG 200\n` +
    `ORANG 150 lf\n\n` +
    `*Untuk /depo:*\n` +
    `/depo @username 100000\n` +
    `atau reply pesan user: /depo 100000\n\n` +
    `*Untuk /kurangi:*\n` +
    `/kurangi @username 50000\n` +
    `atau reply pesan user: /kurangi 50000\n\n` +
    `*Untuk /lunas:*\n` +
    `/lunas @username\n` +
    `atau reply pesan user: /lunas\n\n` +
    `📌 *Keterangan:*\n` +
    `• lf = Lebih Fee\n` +
    `• Format: NAMA JUMLAH (opsional: lf)`,
    { parse_mode: 'Markdown' }
  );
});

// ============ ANTI-LINK HANDLER ============
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

// ============ PM COMMANDS (PUBLIC) ============

// BALANCE
bot.command('balance', (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('❌ Perintah ini hanya di PM.');
  }

  const userData = db.users.get(ctx.from.id) || { balance: 0 };
  ctx.reply(
    `💰 *SALDO ANDA*\n\n` +
    `Balance: ${formatCurrency(userData.balance)} K\n\n` +
    `📌 Gunakan /depo [jumlah] untuk deposit (di grup oleh admin)\n` +
    `📌 Gunakan /wd [jumlah] untuk withdraw (di grup oleh admin)`,
    { parse_mode: 'Markdown' }
  );
});

// ============ ERROR HANDLING ============
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.').catch(() => {});
});

// ============ LAUNCH ============
bot.launch()
  .then(() => {
    console.log('🤖 Bot Rekap aktif dan berjalan...');
    console.log(`👤 Developer: ${DEVELOPER_USERNAME} (ID: ${DEVELOPER_ID})`);
    console.log('📊 Database siap digunakan');
    console.log('📌 SEMUA perintah grup hanya untuk ADMIN');
    console.log('📌 Perintah PM dapat digunakan semua user');
    console.log('📌 Format depo/kurangi/lunas: /command @user jumlah');
  })
  .catch((err) => {
    console.error('Gagal menjalankan bot:', err);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
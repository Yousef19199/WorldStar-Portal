const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ] 
});

// --- الإعدادات النهائية (تأكد من صحتها في موقع المطورين) ---
const BOT_TOKEN = 'MTQ2MzM2ODYxMzY5OTM5MTcxMg.GYSxrg.VnSk168Myxssopzax6JpNS8Rr-wwukLW06iyWw';
const ADMIN_CHANNEL_ID = '1457831080039284760';
const CLIENT_ID = '1463368613699391712';
const CLIENT_SECRET = 'xgfhH2B456ANPBsbxzKTu5OR26goF2AZ';
const CALLBACK_URL = 'http://localhost:3000/auth/discord/callback';

let isApplyOpen = true; 
let submittedUsers = new Set(); // لمنع التقديم أكثر من مرة

// --- إعدادات تسجيل الدخول (Passport) ---
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); 
app.use(session({ 
    secret: 'world_star_secure_key', 
    resave: false, 
    saveUninitialized: false 
}));
app.use(passport.initialize());
app.use(passport.session());

// --- روابط Auth ---
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/');
});

app.get('/api/user', (req, res) => {
    res.json({ user: req.user || null, isOpen: isApplyOpen });
});

// --- إرسال التقديم إلى الديسكورد ---
app.post('/api/submit', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    if (!isApplyOpen) return res.status(403).json({ error: 'التقديم مغلق حالياً' });
    if (submittedUsers.has(req.user.id)) return res.status(400).json({ error: 'أنت مقدم مسبقاً' });

    const data = req.body;
    const channel = client.channels.cache.get(ADMIN_CHANNEL_ID);

    if (channel) {
        const embed = new EmbedBuilder()
            .setTitle('📝 تقديم صناعة محتوى جديد')
            .setColor('#5865F2')
            .setAuthor({ 
                name: `المقدم: ${req.user.username}`, 
                iconURL: `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` 
            })
            .setThumbnail(`https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`)
            .addFields(
                { name: '👤 الاسم الكامل:', value: data.fullName || 'لم يذكر', inline: true },
                { name: '🎂 العمر:', value: data.age || 'لم يذكر', inline: true },
                { name: '📺 اسم القناة ورابطها:', value: data.channelLink || 'لم يذكر' },
                { name: '📊 عدد المشتركين + المشاهدات:', value: data.stats || 'لم يذكر' },
                { name: '🎬 نوع المحتوى:', value: data.contentType || 'لم يذكر' },
                { name: '✍️ عرف عن نفسك كصانع محتوى:', value: data.about || 'لا يوجد' },
                { name: '💡 ماذا تحتاج من الإدارة لمساعدتك؟', value: data.needs || 'لا يوجد احتياجات خاصة' },
                { name: '🎯 ماهي أهدافك مع وورلد ستار؟', value: data.goals || 'لا يوجد' },
                { name: '🆔 Discord ID:', value: `\`${req.user.id}\`` }
            )
            .setFooter({ text: `World Star Roleplay • اليوم الساعة ${new Date().toLocaleTimeString('ar-EG')}` })
            .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_${req.user.id}`).setLabel('قبول ✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_${req.user.id}`).setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ embeds: [embed], components: [buttons] });
        submittedUsers.add(req.user.id);
        res.json({ success: true });
    }
});

// --- نظام الأزرار (قبول / رفض) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    
    const [action, userId] = interaction.customId.split('_');
    const targetUser = await client.users.fetch(userId).catch(() => null);

    if (action === 'accept') {
        await interaction.update({ content: `✅ تم قبول <@${userId}> بواسطة <@${interaction.user.id}>`, components: [] });
        if (targetUser) {
            await targetUser.send("تهانينا! 🎉 تم قبول طلبك لتكون استريمر في **وورلد ستار**. سيتم التواصل معك قريباً لتسليم الرتبة.").catch(() => null);
        }
    } else if (action === 'reject') {
        await interaction.update({ content: `❌ تم رفض <@${userId}> بواسطة <@${interaction.user.id}>`, components: [] });
        if (targetUser) {
            await targetUser.send("نعتذر منك، تم رفض طلب التقديم الخاص بك في **وورلد ستار** حالياً. يمكنك المحاولة لاحقاً.").catch(() => null);
        }
    }
});

// --- أوامر التحكم (فتح/إغلاق التقديم) ---
client.on('messageCreate', message => {
    if (message.content === '!apply toggle') {
        if (!message.member.permissions.has('Administrator')) return;
        isApplyOpen = !isApplyOpen;
        const status = isApplyOpen ? 'مفتوح ✅' : 'مغلق ❌';
        message.reply(`حالة التقديم الآن في الموقع: **${status}**`);
    }
});
const PORT = process.env.PORT || 3000;
client.login(BOT_TOKEN);
app.listen(PORT, () => console.log(`✅ السيرفر شغال على بورت ${PORT}`));

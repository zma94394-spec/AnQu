-- ============================================================================
--  暗区突围 · 改枪码分享站  ——  种子数据 (04_seed.sql)
--  执行   : psql "$DATABASE_URL" -f db/04_seed.sql   （在 02_rls.sql 之后）
--  幂等性 : 全部使用 ON CONFLICT DO NOTHING / DO UPDATE，可反复执行
--  内容   : 6 个分类 / 60 把枪械 / 6 个改枪方案 / 2 条评论
--
--  ⚠️ 上线前必须处理的两处占位数据：
--    1. icon_url —— 占位域名 assets.example-anqu.com，需替换为真实图床/CDN 地址
--    2. builds.code —— 预设方案的改枪码是 DEMO 前缀占位符（长度 16，与游戏内真实
--       码长度一致），**不可导入游戏**。上线前全局搜索 'DEMO' 定位并替换为真实码。
-- ============================================================================

-- ---------------------------------------------------------- 1. 枪械分类字典
INSERT INTO public.gun_categories (slug, name_zh, sort_order) VALUES
  ('assault_rifle', '突击步枪', 10),
  ('smg',           '冲锋枪',   20),
  ('dmr',           '射手步枪', 30),
  ('sniper_rifle',  '狙击枪',   40),
  ('shotgun',       '霰弹枪',   50),
  ('pistol',        '手枪',     60)
ON CONFLICT (slug) DO UPDATE
  SET name_zh = EXCLUDED.name_zh,
      sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------- 2. 基础枪械数据
INSERT INTO public.guns (name, name_en, slug, category, icon_url, sort_order) VALUES
  -- ===== 突击步枪 =====
  ('AKM',        'AKM',        'akm',        'assault_rifle', 'https://assets.example-anqu.com/guns/akm.webp',        10),
  ('AK-74M',     'AK-74M',     'ak-74m',     'assault_rifle', 'https://assets.example-anqu.com/guns/ak-74m.webp',     11),
  ('AK-102',     'AK-102',     'ak-102',     'assault_rifle', 'https://assets.example-anqu.com/guns/ak-102.webp',     12),
  ('AK-12',      'AK-12',      'ak-12',      'assault_rifle', 'https://assets.example-anqu.com/guns/ak-12.webp',      13),
  ('M4A1',       'M4A1',       'm4a1',       'assault_rifle', 'https://assets.example-anqu.com/guns/m4a1.webp',       14),
  ('HK416A5',    'HK416A5',    'hk416a5',    'assault_rifle', 'https://assets.example-anqu.com/guns/hk416a5.webp',    15),
  ('SCAR-L',     'SCAR-L',     'scar-l',     'assault_rifle', 'https://assets.example-anqu.com/guns/scar-l.webp',     16),
  ('SCAR-H',     'SCAR-H',     'scar-h',     'assault_rifle', 'https://assets.example-anqu.com/guns/scar-h.webp',     17),
  ('AUG A3',     'AUG A3',     'aug-a3',     'assault_rifle', 'https://assets.example-anqu.com/guns/aug-a3.webp',     18),
  ('G36C',       'G36C',       'g36c',       'assault_rifle', 'https://assets.example-anqu.com/guns/g36c.webp',       19),
  ('QBZ95-1',    'QBZ95-1',    'qbz95-1',    'assault_rifle', 'https://assets.example-anqu.com/guns/qbz95-1.webp',    20),
  ('QBZ191',     'QBZ191',     'qbz191',     'assault_rifle', 'https://assets.example-anqu.com/guns/qbz191.webp',     21),
  ('TAR-21',     'TAR-21',     'tar-21',     'assault_rifle', 'https://assets.example-anqu.com/guns/tar-21.webp',     22),
  ('SIG MCX',    'SIG MCX',    'sig-mcx',    'assault_rifle', 'https://assets.example-anqu.com/guns/sig-mcx.webp',    23),
  ('M16A4',      'M16A4',      'm16a4',      'assault_rifle', 'https://assets.example-anqu.com/guns/m16a4.webp',      24),
  ('AR-15',      'AR-15',      'ar-15',      'assault_rifle', 'https://assets.example-anqu.com/guns/ar-15.webp',      25),
  -- 以下 2 把为预设方案所需的补充枪械（原种子库缺失，游戏内确实存在）
  ('AK-74N',     'AK-74N',     'ak-74n',     'assault_rifle', 'https://assets.example-anqu.com/guns/ak-74n.webp',     26),
  ('FAL',        'FAL',        'fal',        'assault_rifle', 'https://assets.example-anqu.com/guns/fal.webp',        27),
  ('ACE32',      'ACE32',      'ace32',      'assault_rifle', 'https://assets.example-anqu.com/guns/ace32.webp',      28),

  -- ===== 冲锋枪 =====
  ('MP5',        'MP5',        'mp5',        'smg',           'https://assets.example-anqu.com/guns/mp5.webp',        10),
  ('MP5K',       'MP5K',       'mp5k',       'smg',           'https://assets.example-anqu.com/guns/mp5k.webp',       11),
  ('MP7',        'MP7',        'mp7',        'smg',           'https://assets.example-anqu.com/guns/mp7.webp',        12),
  ('P90',        'P90',        'p90',        'smg',           'https://assets.example-anqu.com/guns/p90.webp',        13),
  ('Vector',     'Vector',     'vector',     'smg',           'https://assets.example-anqu.com/guns/vector.webp',     14),
  ('UMP45',      'UMP45',      'ump45',      'smg',           'https://assets.example-anqu.com/guns/ump45.webp',      15),
  ('UZI',        'UZI',        'uzi',        'smg',           'https://assets.example-anqu.com/guns/uzi.webp',        16),
  ('PP-19',      'PP-19',      'pp-19',      'smg',           'https://assets.example-anqu.com/guns/pp-19.webp',      17),
  ('MPX',        'MPX',        'mpx',        'smg',           'https://assets.example-anqu.com/guns/mpx.webp',        18),
  ('PPSh-41',    'PPSh-41',    'ppsh-41',    'smg',           'https://assets.example-anqu.com/guns/ppsh-41.webp',    19),
  ('MAC-10',     'MAC-10',     'mac-10',     'smg',           'https://assets.example-anqu.com/guns/mac-10.webp',     20),

  -- ===== 射手步枪 =====
  ('SKS',        'SKS',        'sks',        'dmr',           'https://assets.example-anqu.com/guns/sks.webp',        10),
  ('SVT-40',     'SVT-40',     'svt-40',     'dmr',           'https://assets.example-anqu.com/guns/svt-40.webp',     11),
  ('M1A',        'M1A',        'm1a',        'dmr',           'https://assets.example-anqu.com/guns/m1a.webp',        12),
  ('Mk14',       'Mk14',       'mk14',       'dmr',           'https://assets.example-anqu.com/guns/mk14.webp',       13),
  ('SVD',        'SVD',        'svd',        'dmr',           'https://assets.example-anqu.com/guns/svd.webp',        14),
  ('SR-25',      'SR-25',      'sr-25',      'dmr',           'https://assets.example-anqu.com/guns/sr-25.webp',      15),
  ('VSS',        'VSS',        'vss',        'dmr',           'https://assets.example-anqu.com/guns/vss.webp',        16),
  ('QBU-88',     'QBU-88',     'qbu-88',     'dmr',           'https://assets.example-anqu.com/guns/qbu-88.webp',     17),
  ('M110',       'M110',       'm110',       'dmr',           'https://assets.example-anqu.com/guns/m110.webp',       18),

  -- ===== 狙击枪 =====
  ('M700',       'M700',       'm700',       'sniper_rifle',  'https://assets.example-anqu.com/guns/m700.webp',       10),
  ('AWM',        'AWM',        'awm',        'sniper_rifle',  'https://assets.example-anqu.com/guns/awm.webp',        11),
  ('SV-98',      'SV-98',      'sv-98',      'sniper_rifle',  'https://assets.example-anqu.com/guns/sv-98.webp',      12),
  ('M82A1',      'M82A1',      'm82a1',      'sniper_rifle',  'https://assets.example-anqu.com/guns/m82a1.webp',      13),
  ('T-5000',     'T-5000',     't-5000',     'sniper_rifle',  'https://assets.example-anqu.com/guns/t-5000.webp',     14),
  ('M24',        'M24',        'm24',        'sniper_rifle',  'https://assets.example-anqu.com/guns/m24.webp',        15),
  -- 预设方案所需的补充枪械（原种子库缺失，游戏内确实存在）
  ('Mosin-Nagant','Mosin-Nagant','mosin-nagant','sniper_rifle','https://assets.example-anqu.com/guns/mosin-nagant.webp',16),

  -- ===== 霰弹枪 =====
  ('M870',       'M870',       'm870',       'shotgun',       'https://assets.example-anqu.com/guns/m870.webp',       10),
  ('KS-23',      'KS-23',      'ks-23',      'shotgun',       'https://assets.example-anqu.com/guns/ks-23.webp',      11),
  ('Saiga-12',   'Saiga-12',   'saiga-12',   'shotgun',       'https://assets.example-anqu.com/guns/saiga-12.webp',   12),
  ('SPAS-12',    'SPAS-12',    'spas-12',    'shotgun',       'https://assets.example-anqu.com/guns/spas-12.webp',    13),
  ('Mossberg 590','Mossberg 590','mossberg-590','shotgun',     'https://assets.example-anqu.com/guns/mossberg-590.webp',14),
  ('TOZ-106',    'TOZ-106',    'toz-106',    'shotgun',       'https://assets.example-anqu.com/guns/toz-106.webp',    15),

  -- ===== 手枪 =====
  ('Glock 17',   'Glock 17',   'glock-17',   'pistol',        'https://assets.example-anqu.com/guns/glock-17.webp',   10),
  ('P226',       'P226',       'p226',       'pistol',        'https://assets.example-anqu.com/guns/p226.webp',       11),
  ('M1911',      'M1911',      'm1911',      'pistol',        'https://assets.example-anqu.com/guns/m1911.webp',      12),
  ('Desert Eagle','Desert Eagle','desert-eagle','pistol',     'https://assets.example-anqu.com/guns/desert-eagle.webp',13),
  ('Five-seveN', 'Five-seveN', 'five-seven', 'pistol',        'https://assets.example-anqu.com/guns/five-seven.webp', 14),
  ('USP45',      'USP45',      'usp45',      'pistol',        'https://assets.example-anqu.com/guns/usp45.webp',      15),
  ('R1895',      'R1895',      'r1895',      'pistol',        'https://assets.example-anqu.com/guns/r1895.webp',      16),
  ('G18C',       'G18C',       'g18c',       'pistol',        'https://assets.example-anqu.com/guns/g18c.webp',       17)
ON CONFLICT (slug) DO UPDATE
  SET name       = EXCLUDED.name,
      name_en    = EXCLUDED.name_en,
      category   = EXCLUDED.category,
      icon_url   = EXCLUDED.icon_url,
      sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------- 3. 改枪方案
-- 固定 UUID，便于接口联调与自动化测试断言；生产环境可整体删除本段。
--
-- 3.1 通用演示方案（3 条，UUID 前缀 1111/2222/3333）
-- 3.2 业务方指定预设方案（3 条，UUID 前缀 4444/5555/6666）
--     · 造价与平台严格对齐需求规格，已由 tests/integration.test.mjs 逐项断言
--     · likes_count / copies_count 留 0：计数列由触发器与 RPC 维护，
--       种子阶段不注入虚假互动数据
INSERT INTO public.builds (
  id, gun_id, author_id, title, code, estimated_cost, platform, tags, description,
  likes_count, copies_count, status
)
SELECT
  d.id,
  g.id,
  NULL,
  d.title,
  d.code,
  d.estimated_cost,
  d.platform::public.build_platform,
  d.tags,
  d.description,
  d.likes_count,
  d.copies_count,
  'published'::public.build_status
FROM (VALUES
  -- ---- 3.1 通用演示方案 ----
  (
    '11111111-1111-4111-8111-111111111111'::uuid,
    'akm',
    '【性价比】3万柯恩币封锁区拉满',
    '3042187654921837465012938475610293847561',
    30000::numeric,
    'both',
    ARRAY['性价比','低后坐','腰射'],
    E'全改造 AKM，主打低造价高稳定性。\n建议子弹：7.62×39 BP（穿甲）或 PS（日常）。\n枪口选制退器压后坐，握把走垂直握把，弹匣用 30 发标准弹匣控制重量。',
    128, 452
  ),
  (
    '22222222-2222-4222-8222-222222222222'::uuid,
    'm4a1',
    '【高端】M4A1 极限后坐控制 · 端游无限',
    '9182736455091827364550918273645509182736',
    118000::numeric,
    'pc',
    ARRAY['高后坐控制','远距离','端游专属'],
    E'面向《无限》端游的高配 M4A1。\n建议子弹：5.56×45 M995 或 M855A1。\n重枪管 + 战术前握把 + 缓冲枪托，优先堆垂直后坐与水平后坐。',
    342, 1105
  ),
  (
    '33333333-3333-4333-8333-333333333333'::uuid,
    'mp5',
    '【手游】MP5 腰射流 · 6万以内',
    '5566778899001122334455667788990011223344',
    58000::numeric,
    'mobile',
    ARRAY['腰射','机动性','手游友好'],
    E'手游操作习惯优化，主打近距离腰射与快速转移。\n建议子弹：9×19 AP6.3。\n轻量化枪托 + 激光指示器，牺牲部分精度换取开镜速度与移动射击稳定性。',
    96, 271
  ),

  -- ---- 3.2 业务方指定预设方案 ----
  (
    '44444444-4444-4444-8444-444444444444'::uuid,
    'ak-74n',
    '【S4开荒】平民极简低后坐AK74N',
    'DEMOAK74N0000001',
    32000::numeric,
    'both',
    ARRAY['性价比','新手推荐','低后坐'],
    E'开荒期低成本起装：轻型握把 + 基础消音器，把垂直后坐压到可控区间。\n建议子弹：5.45×39 PP（穿甲）或 BP（均衡）。\n没有堆任何昂贵配件，造价压在 3.2 万，适合封锁区反复起装。',
    0, 0
  ),
  (
    '55555555-5555-4555-8555-555555555555'::uuid,
    'fal',
    '【满配战神】FAL 绝对火力拉满改法',
    'DEMOFAL000000002',
    120000::numeric,
    'pc',
    ARRAY['满配','高后坐高伤害','军港/电视台'],
    E'端游《无限》满配思路：长枪管 + 长消音 + 50 发大弹匣，中近距离弹雨压制一切。\n建议子弹：7.62×51 M61（穿甲）或 M62（均衡），弹药档次直接决定这把枪的上限。\n后坐偏大且左右抖动明显，建议点射或依托掩体短点射。',
    0, 0
  ),
  (
    '66666666-6666-4666-8666-666666666666'::uuid,
    'mp5',
    '【腰射战神】高性价比 MP5 跑图神器',
    'DEMOMP5000000003',
    28000::numeric,
    'mobile',
    ARRAY['腰射','室内战','跑图'],
    E'手游向腰射流：加装战术手电 + 腰射激光，室内战斗无需开镜，抬手即可压制。\n建议子弹：9×19 7N31（穿甲）或 DumDum 达姆弹（专打腿部）。\n造价 2.8 万，跑图带出去不心疼，适合快速转移与近身遭遇。',
    0, 0
  )
) AS d(id, gun_slug, title, code, estimated_cost, platform, tags, description, likes_count, copies_count)
JOIN public.guns g ON g.slug = d.gun_slug
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------- 4. 演示评论
INSERT INTO public.comments (id, build_id, author_id, content) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid, NULL,
   '用了一周，封锁区稳定带走两个，造价确实压得住。'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid, NULL,
   '建议把枪口换成补偿器，近距离压制手感更好。')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------- 5. 校验
-- 执行后应返回：6 个分类 / 60 把枪 / 6 个方案 / 2 条评论
-- SELECT
--   (SELECT count(*) FROM public.gun_categories) AS categories,
--   (SELECT count(*) FROM public.guns)           AS guns,
--   (SELECT count(*) FROM public.builds)         AS builds,
--   (SELECT count(*) FROM public.comments)       AS comments;

-- 单独核对业务方指定的 3 个预设方案（应返回 3 行，且 cost 为 32000/120000/28000）
-- SELECT g.name AS gun, b.title, b.estimated_cost, b.platform, b.tags
-- FROM public.builds b
-- JOIN public.guns g ON g.id = b.gun_id
-- WHERE b.id IN (
--   '44444444-4444-4444-8444-444444444444',
--   '55555555-5555-4555-8555-555555555555',
--   '66666666-6666-4666-8666-666666666666'
-- )
-- ORDER BY b.estimated_cost;

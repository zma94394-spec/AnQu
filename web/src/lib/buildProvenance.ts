/**
 * 方案来源标注（三态）。
 *
 * 只认两类**可核证**的来源：
 *   · 已知演示：Mock 世界，或 `db/04_seed.sql` 写死的六个 UUID（与 db/10 的
 *     SEED_DEMO 登记同一组行）；
 *   · 玩家投稿：后端透出的 `data_origin = 'USER_SUBMISSION'`（db/10 由
 *     `build_submissions.materialized_build_id` 触发器写入，是投稿管线落库的痕迹）。
 *
 * 其余一律“来源未核实”。**不得**仅凭“不属于 6 个 seed UUID”就推断是玩家投稿 ——
 * 那会把未知来源洗成真实来源。`data_origin` 缺失（数据库未执行 db/10）同样落到未知态。
 */
export const SEED_DEMO_BUILD_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
] as const;

const SEED_DEMO = new Set<string>(SEED_DEMO_BUILD_IDS);

export type BuildProvenanceKind = 'DEMO' | 'PLAYER_SUBMISSION' | 'SOURCE_UNVERIFIED';

export interface BuildProvenance {
  kind: BuildProvenanceKind;
  /** 是否为演示数据（热度榜口径、分栏用） */
  demo: boolean;
  /** 是否为有来源标记的玩家投稿 */
  playerSubmission: boolean;
  /** 紧凑位置用的短徽章 */
  badge: string;
  /** 卡片 / 详情页用的完整标注 */
  label: string;
  /** 展开说明或 title 文本 */
  reason: string;
}

export interface BuildProvenanceInput {
  id: string;
  data_origin?: string | null;
}

const DEMO_SEED: BuildProvenance = {
  kind: 'DEMO',
  demo: true,
  playerSubmission: false,
  badge: '演示',
  label: '演示条目 · 非玩家投稿',
  reason:
    '这条由站点初始化脚本写入，不是玩家投稿；点赞 / 复制是样例基线，不代表社区热度。',
};

const DEMO_MOCK: BuildProvenance = {
  kind: 'DEMO',
  demo: true,
  playerSubmission: false,
  badge: '演示',
  label: 'Mock 演示 · 非玩家投稿',
  reason: '这是内置 Mock 演示条目，不是玩家投稿；仅用于本地预览界面，计数与评论都是夹具。',
};

const PLAYER_SUBMISSION: BuildProvenance = {
  kind: 'PLAYER_SUBMISSION',
  demo: false,
  playerSubmission: true,
  badge: '玩家投稿',
  label: '玩家投稿 · 审核入库',
  reason:
    '该条目在数据里标记为由投稿管线入库（data_origin=USER_SUBMISSION）；来源可追，但不等于客户端导入验证。',
};

const SOURCE_UNVERIFIED: BuildProvenance = {
  kind: 'SOURCE_UNVERIFIED',
  demo: false,
  playerSubmission: false,
  badge: '未核实',
  label: '来源未核实 · 不推断为玩家投稿',
  reason:
    '数据库没有可确认的来源标记（data_origin 缺失或为 UNATTRIBUTED）；本站不把它称作玩家投稿，也不声称已验证。',
};

/**
 * @param build 至少要有 id 与 data_origin
 * @param useMock 当前是否为内置 Mock 预览模式
 */
export function buildProvenanceOf(
  build: BuildProvenanceInput,
  useMock: boolean,
): BuildProvenance {
  if (useMock) return DEMO_MOCK;
  if (build.data_origin === 'SEED_DEMO' || SEED_DEMO.has(build.id)) return DEMO_SEED;
  if (build.data_origin === 'USER_SUBMISSION') return PLAYER_SUBMISSION;
  return SOURCE_UNVERIFIED;
}

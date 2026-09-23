/**
 * ============================================================================
 *  前端校验 ↔ 后端 zod schema 的一致性校验
 *
 *  为什么需要这个脚本：
 *    `web/src/lib/validation.ts` 里逐条手写镜像了后端 `createBuildBodySchema`
 *    的规则。这种"两处手写同一套规则"的结构必然会漂移 ——
 *    后端改了 max(80) 而前端没跟着改，用户就会看到"前端放行、后端 400"的怪现象。
 *
 *  这个脚本把两边跑在同一批输入上，断言两条方向都成立：
 *    A. 前端判定合法  => 后端必须也接受   （不能给用户虚假信心）
 *    B. 后端判定非法  => 前端必须也拦下   （不能让用户白填一遍再被拒）
 *
 *  运行：npm run check:validation
 * ============================================================================
 */

import { createBuildBodySchema } from '../../src/schemas/builds.schema.js';
import { EMPTY_FORM, toCreateBuildInput, validateForm } from '../src/lib/validation.ts';
import type { PublishFormValues } from '../src/lib/validation.ts';

/** 一个真实存在的枪械 UUID（取自后端种子数据的形态） */
const GUN_ID = '44444444-4444-4444-8444-444444444444';

/** 合法基线，各用例只覆盖需要变化的字段 */
const BASE: PublishFormValues = {
  ...EMPTY_FORM,
  gun_id: GUN_ID,
  title: '【S4开荒】平民极简低后坐AK74N',
  code: 'DEMOAK74N0000001',
  estimated_cost: '32000',
  platform: 'both',
  tags: ['性价比', '低后坐'],
  description: '轻型握把 + 基础消音。建议子弹：5.45×39 PP 或 BP。',
};

interface Case {
  name: string;
  values: PublishFormValues;
  /** 期望两边都判定为合法还是非法；留空表示只要求两边结论一致 */
  expect?: 'valid' | 'invalid';
}

const CASES: Case[] = [
  { name: '基线（全部合法）', values: BASE, expect: 'valid' },

  // ---- title：后端 min(2) / max(80) ----
  { name: 'title 空', values: { ...BASE, title: '' }, expect: 'invalid' },
  { name: 'title 仅 1 字符', values: { ...BASE, title: 'A' }, expect: 'invalid' },
  { name: 'title 恰好 2 字符', values: { ...BASE, title: 'AB' }, expect: 'valid' },
  { name: 'title 恰好 80 字符', values: { ...BASE, title: 'x'.repeat(80) }, expect: 'valid' },
  { name: 'title 81 字符', values: { ...BASE, title: 'x'.repeat(81) }, expect: 'invalid' },
  { name: 'title 两侧空白后仍不足 2 字符', values: { ...BASE, title: ' A ' }, expect: 'invalid' },

  // ---- code：8~2048 可打印 ASCII 且不含空白 ----
  { name: 'code 空', values: { ...BASE, code: '' }, expect: 'invalid' },
  { name: 'code 7 位', values: { ...BASE, code: '1234567' }, expect: 'invalid' },
  { name: 'code 恰好 8 位', values: { ...BASE, code: '12345678' }, expect: 'valid' },
  { name: 'code 含空格', values: { ...BASE, code: '1234 5678' }, expect: 'invalid' },
  { name: 'code 含换行', values: { ...BASE, code: '12345\n678' }, expect: 'invalid' },
  { name: 'code 含中文', values: { ...BASE, code: '1234改枪码5678' }, expect: 'invalid' },
  { name: 'code 恰好 2048 位', values: { ...BASE, code: 'a'.repeat(2048) }, expect: 'valid' },
  { name: 'code 2049 位', values: { ...BASE, code: 'a'.repeat(2049) }, expect: 'invalid' },

  // ---- estimated_cost：整数 0 ~ 999999999999 ----
  { name: 'cost 空', values: { ...BASE, estimated_cost: '' }, expect: 'invalid' },
  { name: 'cost 0', values: { ...BASE, estimated_cost: '0' }, expect: 'valid' },
  { name: 'cost 负数', values: { ...BASE, estimated_cost: '-1' }, expect: 'invalid' },
  { name: 'cost 小数', values: { ...BASE, estimated_cost: '1.5' }, expect: 'invalid' },
  { name: 'cost 恰好上限', values: { ...BASE, estimated_cost: '999999999999' }, expect: 'valid' },
  { name: 'cost 超上限', values: { ...BASE, estimated_cost: '1000000000000' }, expect: 'invalid' },
  { name: 'cost 带千分位逗号', values: { ...BASE, estimated_cost: '32,000' }, expect: 'invalid' },

  // ---- tags：最多 8 个，单个 1~16 字符 ----
  { name: 'tags 空数组', values: { ...BASE, tags: [] }, expect: 'valid' },
  { name: 'tags 恰好 8 个', values: { ...BASE, tags: Array.from({ length: 8 }, (_, i) => `t${i}`) }, expect: 'valid' },
  { name: 'tags 9 个', values: { ...BASE, tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }, expect: 'invalid' },
  { name: 'tag 恰好 16 字符', values: { ...BASE, tags: ['x'.repeat(16)] }, expect: 'valid' },
  { name: 'tag 17 字符', values: { ...BASE, tags: ['x'.repeat(17)] }, expect: 'invalid' },
  { name: 'tag 为纯空格', values: { ...BASE, tags: ['   '] }, expect: 'invalid' },

  // ---- description：max(2000) ----
  { name: 'description 空（归一为 null）', values: { ...BASE, description: '' }, expect: 'valid' },
  { name: 'description 恰好 2000 字符', values: { ...BASE, description: 'x'.repeat(2000) }, expect: 'valid' },
  { name: 'description 2001 字符', values: { ...BASE, description: 'x'.repeat(2001) }, expect: 'invalid' },

  // ---- platform ----
  { name: 'platform=mobile', values: { ...BASE, platform: 'mobile' }, expect: 'valid' },
  { name: 'platform=pc', values: { ...BASE, platform: 'pc' }, expect: 'valid' },
  { name: 'platform=both', values: { ...BASE, platform: 'both' }, expect: 'valid' },
];

let pass = 0;
const failures: string[] = [];
const divergences: string[] = [];

for (const testCase of CASES) {
  const frontendErrors = validateForm(testCase.values);
  const frontendValid = Object.keys(frontendErrors).length === 0;

  const payload = toCreateBuildInput(testCase.values);
  const backendResult = createBuildBodySchema.safeParse(payload);
  const backendValid = backendResult.success;

  const agrees = frontendValid === backendValid;

  if (!agrees) {
    divergences.push(
      `  ${testCase.name}\n` +
        `      前端: ${frontendValid ? '通过' : '拒绝 ' + JSON.stringify(frontendErrors)}\n` +
        `      后端: ${backendValid ? '通过' : '拒绝 ' + backendResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }

  const expectationMismatch =
    testCase.expect !== undefined &&
    ((testCase.expect === 'valid' && !frontendValid) ||
      (testCase.expect === 'invalid' && frontendValid));

  if (expectationMismatch) {
    failures.push(
      `  ${testCase.name}：期望${testCase.expect === 'valid' ? '合法' : '非法'}，` +
        `但前端判定为${frontendValid ? '合法' : '非法'}（后端：${backendValid ? '合法' : '非法'}）`,
    );
  } else if (agrees) {
    pass += 1;
  }
}

console.log('='.repeat(72));
console.log(`用例总数：${CASES.length}`);
console.log(`两端一致：${pass}`);
console.log(`两端分歧：${divergences.length}`);
console.log(`期望不符：${failures.length}`);
console.log('='.repeat(72));

if (divergences.length > 0) {
  console.log('\n【两端判定不一致】前端校验与后端 schema 已漂移，需修正：');
  console.log(divergences.join('\n'));
}

if (failures.length > 0) {
  console.log('\n【与预期不符】');
  console.log(failures.join('\n'));
}

if (divergences.length === 0 && failures.length === 0) {
  console.log('\n✅ 前端校验与后端 zod schema 完全一致。');
  process.exit(0);
}

process.exit(1);

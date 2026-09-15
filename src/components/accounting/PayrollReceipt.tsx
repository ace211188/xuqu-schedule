"use client";

import type { ReactNode } from "react";
import { fmtMoney } from "@/lib/accounting";
import {
  COURSE_TYPES,
  fmtRocYm,
  toRocYear,
  type Payee,
  type TaxResult,
} from "@/lib/payroll";

export type ReceiptData = {
  payee: Payee;
  payYm: string; // 'YYYY-MM'（西元）
  issueDate: string; // 'YYYY-MM-DD'
  courseTypes: string[];
  tax: TaxResult;
};

// 小勾選框：印刷用黑框白底
function Chk({ on, children }: { on?: boolean; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span className="inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center border border-black text-[10px] font-bold leading-none">
        {on ? "✓" : ""}
      </span>
      {children != null && <span>{children}</span>}
    </span>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border border-black bg-black/[0.06] px-2 py-1 text-left align-top font-semibold">
      {children}
    </th>
  );
}
function Td({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <td className={`border border-black px-2 py-1 align-top ${className}`}>
      {children}
    </td>
  );
}

function SectionBar({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 mb-1.5 border-l-4 border-black bg-black/[0.06] px-2 py-1 text-[13px] font-bold">
      {children}
    </div>
  );
}

// 兩頁 A4 簽收單／領據（比對教室範本）。forPrint 時掛 id="payroll-print" 供列印 CSS 只印這塊。
export default function PayrollReceipt({
  data,
  forPrint = false,
}: {
  data: ReceiptData;
  forPrint?: boolean;
}) {
  const { payee, payYm, issueDate, courseTypes, tax } = data;
  const [iy, im, id] = issueDate.split("-").map(Number);
  const issueRoc = iy ? `民國 ${toRocYear(iy)} 年 ${im} 月 ${id} 日` : "＿＿";
  const bankLine = [payee.bank_name, payee.bank_branch]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      id={forPrint ? "payroll-print" : undefined}
      className="mx-auto bg-white text-[12px] leading-relaxed text-black"
      style={{ width: "186mm" }}
    >
      {/* ── 第 1 頁 ── */}
      <section className="payroll-page">
        <h1 className="text-center text-[18px] font-bold">
          【序曲音樂學院】教師授課勞務報酬簽收單／領據
        </h1>
        <div className="mt-1 mb-1 text-center text-[12px]">
          給付年月：{fmtRocYm(payYm)}　|　填表日期：{issueRoc}
        </div>
        <div className="border-t-2 border-black" />

        <SectionBar>一、領款人（老師）基本資料</SectionBar>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <Th>所得人姓名</Th>
              <Td className="w-[32%]">{payee.name}</Td>
              <Th>身分證字號</Th>
              <Td className="w-[28%]">{payee.id_number ?? ""}</Td>
            </tr>
            <tr>
              <Th>戶籍地址</Th>
              <Td>
                {payee.address ?? ""}
              </Td>
              <Th>出生年月日</Th>
              <Td>{payee.birth_roc ? `民國 ${payee.birth_roc}` : ""}</Td>
            </tr>
            <tr>
              <Th>聯絡電話</Th>
              <Td>{payee.phone ?? ""}</Td>
              <Th>匯款銀行／帳號</Th>
              <Td>
                <div>{bankLine}</div>
                <div>帳號：{payee.bank_account ?? ""}</div>
              </Td>
            </tr>
          </tbody>
        </table>

        <SectionBar>二、授課內容與所得類別</SectionBar>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <Th>授課種類／項目</Th>
              <Td>
                <div className="flex flex-col gap-1">
                  {COURSE_TYPES.map((c) => (
                    <Chk key={c} on={courseTypes.includes(c)}>
                      {c}
                    </Chk>
                  ))}
                </div>
              </Td>
            </tr>
            <tr>
              <Th>所得類別判定</Th>
              <Td>
                <div className="flex flex-col gap-1">
                  <Chk on={payee.income_category === "執行業務"}>
                    執行業務所得（50 9B - 執行業務／表演人）
                  </Chk>
                  <Chk on={payee.income_category === "兼職薪資"}>
                    兼職薪資所得（50 50 - 兼職薪資）
                  </Chk>
                </div>
              </Td>
            </tr>
          </tbody>
        </table>

        <SectionBar>三、扣繳稅款與二代健保補充保費 檢核與試算</SectionBar>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>項目</Th>
              <Th>單次給付金額</Th>
              <Th>扣繳檢核條件與門檻</Th>
              <Th>應扣金額 (NT$)</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td className="font-semibold">(A) 應給付總額（片酬／鐘點費）</Td>
              <Td className="text-right font-semibold tabular-nums">
                {fmtMoney(tax.gross)}
              </Td>
              <Td>依課表／契約計算之總鐘點費或拆帳金額</Td>
              <Td className="text-right">—</Td>
            </tr>
            <tr>
              <Td className="font-semibold">(B) 預扣所得稅款</Td>
              <Td>
                <div className="flex flex-col gap-1">
                  <Chk on={tax.taxExempt}>免扣繳</Chk>
                  <Chk on={!tax.taxExempt}>需扣繳（{tax.taxRatePct}%）</Chk>
                </div>
              </Td>
              <Td>
                • 執行業務所得：單次給付 ≥ $20,009 預扣 10%
                <br />• 兼職薪資所得：單次給付 ≥ $88,501 預扣 5%
              </Td>
              <Td className="text-right font-semibold tabular-nums">
                {fmtMoney(tax.taxWithholding)}
              </Td>
            </tr>
            <tr>
              <Td className="font-semibold">(C) 補充保費（個人 2.11%）</Td>
              <Td>
                <div className="flex flex-col gap-1">
                  <Chk on={tax.nhiExempt}>免扣繳（符合豁免）</Chk>
                  <Chk on={!tax.nhiExempt}>需扣繳（2.11%）</Chk>
                </div>
              </Td>
              <Td>
                • 單次給付 ≥ $20,000 需扣繳 2.11%
                <br />• 免扣條款：具職業工會投保證明者（且所得類別為執行業務所得）免扣補充保費。
              </Td>
              <Td className="text-right font-semibold tabular-nums">
                {fmtMoney(tax.nhiPremium)}
              </Td>
            </tr>
            <tr>
              <Td className="bg-black/[0.06] text-right font-bold" >
                <span className="float-left">實發金額合計（D = A − B − C）</span>
              </Td>
              <Td className="bg-black/[0.06]" />
              <Td className="bg-black/[0.06]" />
              <Td className="bg-black/[0.06] text-right text-[14px] font-bold tabular-nums">
                {fmtMoney(tax.netAmount)}
              </Td>
            </tr>
          </tbody>
        </table>

        <div className="mt-2 border border-black px-2 py-1.5 text-[11px]">
          <Chk on={tax.unionDeclaration}>
            <span>
              補充保費免扣繳聲明：本人已參加音樂類職業工會（工會名稱：
              <span className="px-1 font-semibold underline">
                {payee.union_name ?? "＿＿＿＿＿＿＿＿"}
              </span>
              ），並檢附有效之工會投保證明影本。本筆所得（執行業務所得）符合全民健康保險法扣繳豁免規定，免扣取個人補充保費。
            </span>
          </Chk>
        </div>

        <div className="mt-4 text-right text-[11px] text-black/70">
          第 1 頁，共 2 頁
        </div>
      </section>

      {/* ── 第 2 頁 ── */}
      <section className="payroll-page payroll-page-break">
        <SectionBar>四、身分證明與工會投保證明黏貼處</SectionBar>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex h-[52mm] flex-col items-center justify-center border border-dashed border-black/70 p-2 text-center text-[11px] text-black/60">
            <div className="font-semibold text-black/80">
              【身分證正面影本 黏貼處】
            </div>
            <div className="mt-1">請清晰浮貼，文字與照片須可辨識，僅供報稅與身份核對使用</div>
          </div>
          <div className="flex h-[52mm] flex-col items-center justify-center border border-dashed border-black/70 p-2 text-center text-[11px] text-black/60">
            <div className="font-semibold text-black/80">
              【身分證反面影本 黏貼處】
            </div>
            <div className="mt-1">戶籍地址須與正面填寫一致</div>
          </div>
        </div>
        <div className="mt-3 flex h-[52mm] flex-col items-center justify-center border border-dashed border-black/70 p-2 text-center text-[11px] text-black/60">
          <div className="font-semibold text-black/80">
            【職業工會投保證明／健保繳費證明影本 黏貼處】
          </div>
          <div className="mt-1">
            ※ 若主張免扣二代健保補充保費，請務必黏貼音樂工會當期投保證明或繳費收據
          </div>
        </div>

        <div className="mt-4 text-[11px]">
          <span className="font-bold">領據聲明：</span>
          茲收到上述金額無誤，本人確認填寫之各項基本資料與檢附之證件影本均屬實，並同意音樂教室依法辦理扣繳與所得稅申報。
        </div>

        <div className="mt-10 grid grid-cols-3 gap-6 text-[12px]">
          {["領款人（簽章）", "教室經辦／核稿", "負責人／主管"].map((s) => (
            <div key={s}>
              <div className="mb-6">{s}：</div>
              <div className="border-t border-black" />
            </div>
          ))}
        </div>

        <div className="mt-4 text-right text-[11px] text-black/70">
          第 2 頁，共 2 頁
        </div>
      </section>
    </div>
  );
}

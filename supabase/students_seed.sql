-- 學生資料卡 seed：29 頁手寫卡整理，共 30 名（含雙胞胎）。
-- 由 gen_seed.py 產生。冪等：先清空再插入僅適合初次匯入，這裡用『name 不存在才插入』。

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '徐于茹',NULL,'女','103/3/31','永和國中','在學','115/7/22','115/7/22',NULL,NULL,'劉音蘭','0922670625','媽','夏小蘭(于茹媽媽)',NULL,'FB／路過',NULL,NULL,'鋼琴, 樂理',NULL,'雙軌 12000',NULL,NULL,'小孩內向，但學習動機高、好教。⚠老師欄字跡不清待補'
where not exists (select 1 from public.students where name = '徐于茹');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '趙翊丞',NULL,'男','110/4/19','福樂','在學','115/3/5','115/3/5',NULL,NULL,'曾巧芳','0937701962',NULL,NULL,NULL,NULL,NULL,NULL,'兒音','蓁芸',NULL,NULL,NULL,'首次繳費 2026/3/19'
where not exists (select 1 from public.students where name = '趙翊丞');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '趙梓涵',NULL,'女','108/9/3','福樂','在學','115/3/5','115/3/5',NULL,NULL,'曾巧芳','0937701962','媽',NULL,NULL,NULL,NULL,NULL,'鋼琴, 樂理','美君',NULL,NULL,NULL,'下一期告知、下下一期新價（2026/6/18）。繳費 2026/3/19 起～5/14'
where not exists (select 1 from public.students where name = '趙梓涵');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '蕭以樂',NULL,'男','110/9/11','快樂瑪莉安','在學','115/5/21','115/5/21','蕭柏倫(IT)','0965300970','高綺蓮(IT)','0937553695','媽',NULL,NULL,NULL,NULL,'B1','兒音','蓁芸',NULL,NULL,NULL,'2027/6 安排升班。繳費 5/21'
where not exists (select 1 from public.students where name = '蕭以樂');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '蕭以撒',NULL,'男','113/2/14','快樂瑪莉安','在學','2026/6/6','2026/6/18','蕭柏倫(IT)','0965300970','高綺蓮(IT)','0937553695','媽',NULL,NULL,NULL,NULL,'A1','幼幼班','蓁芸',NULL,NULL,NULL,'2027/7 安排升班。繳費 6/6。⚠父電與兄長卡差一碼待核'
where not exists (select 1 from public.students where name = '蕭以撒');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '張立媞',NULL,'女','109/11/15','新和附幼','在學','115/5/21','115/5/21',NULL,NULL,'吳佩倫(金融業)','0919992346','媽',NULL,NULL,NULL,NULL,'B1','兒音','蓁芸',NULL,NULL,NULL,'2028/9 入學；約 2027/7 到期以新價推雙軌（2026/6/16）。繳費 2026/6/4 年繳'
where not exists (select 1 from public.students where name = '張立媞');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '徐子翔',NULL,'男','105/7/10','中和國小','在學','2026/7/4','2026/6/19','徐志達','0917700661','陳錦如','0975715205',NULL,NULL,NULL,'Google map',NULL,'個別','鋼琴','恩妤','個別一期 8000',2000,'訂金 $2000/位，共2位','6/19 訂金$2000/位，共2位；約7/4 19:00 上第一堂 piano。⚠老師『昱妤』非現有師資待核'
where not exists (select 1 from public.students where name = '徐子翔');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '陳畇忻',NULL,'女','105/4/1','中和國小','在學','2026/7/4','2026/6/19','徐志達','0917700661','陳錦如','0975715205',NULL,NULL,NULL,'Google map',NULL,'個別','長笛','美君','個別一期 8000',2000,'訂金 $2000/位，共2位','6/19 訂金$2000/位，共2位；約7/4 19:00 上第一堂 Flute。與徐子翔為手足'
where not exists (select 1 from public.students where name = '陳畇忻');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '許亦岑',NULL,'女','105/1/8',NULL,'在學',NULL,'115/6/5',NULL,NULL,'游雅云',NULL,'媽',NULL,NULL,'舊生轉介',NULL,NULL,'鋼琴, 樂理','奕寬',NULL,NULL,NULL,'⚠母『游雅云』來自 Overture，卡片未填；與許仲睿為手足'
where not exists (select 1 from public.students where name = '許亦岑');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '許仲睿',NULL,'男','102/6/8',NULL,'在學',NULL,'115/6/5',NULL,NULL,'游雅云',NULL,'媽',NULL,NULL,'舊生',NULL,'C3','爵士鼓, 鋼琴, 樂理','宇群, 奕寬, 奕寬',NULL,NULL,NULL,'⚠母『游雅云』來自 Overture，卡片未填；與許亦岑為手足'
where not exists (select 1 from public.students where name = '許仲睿');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '李依恩',NULL,'女','112/11/8',NULL,'在學','115/3/14','115/3/14',NULL,NULL,'陳允婷(護理師)','0981036066','媽',NULL,NULL,NULL,NULL,'A1','幼幼班','蓁芸',NULL,NULL,NULL,'2026/9 試著接軌兒音，價格照新價格算'
where not exists (select 1 from public.students where name = '李依恩');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '蔡昀夏',NULL,'女','110/7/23','成真幼兒園','在學','114/8/17','114/8/17','蔡宗廷','0975350197','黃楨茹','0965188907','媽',NULL,NULL,NULL,NULL,'B3','兒音','美君',NULL,NULL,NULL,'2026/10 到期，推雙軌照新價（2026/6/18）。繳費 2025/9 六年繳'
where not exists (select 1 from public.students where name = '蔡昀夏');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '陳宥學',NULL,'男','108/11/18',NULL,'在學','115/3/7','115/3/7','陳緯銘','0937914397','張芷睿','0919336529','爸+媽',NULL,NULL,'舊生',NULL,'C4','長笛, 樂理(團班)','美君, 美君',NULL,NULL,NULL,'雙胞胎(弟)。2026/9 入學，下期照新價格收，到期約 2027/4。年繳 2026/3/9'
where not exists (select 1 from public.students where name = '陳宥學');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '陳宥語',NULL,'女','108/11/18',NULL,'在學','115/3/7','115/3/7','陳緯銘','0937914397','張芷睿','0919336529','爸+媽',NULL,NULL,'舊生',NULL,'C4','小提琴, 樂理(團班)','蓁芸, 美君',NULL,NULL,NULL,'雙胞胎(姐)。2026/9 入學，下期照新價格收，到期約 2027/4。年繳 2026/3/9'
where not exists (select 1 from public.students where name = '陳宥語');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '莊舒羽',NULL,'女','112/3/9','信誼幼兒園','在學','114/9/27','114/9/27','莊銘碩','0934331998','莊許衍','0910121432','媽',NULL,NULL,NULL,NULL,'A1','幼幼班','蓁芸',NULL,NULL,NULL,'2029/9 入學。需商量升班時間，升班照新價算（2026/6/18）。繳費 2026/3/14。⚠母姓名字跡不清待核'
where not exists (select 1 from public.students where name = '莊舒羽');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '林永彬',NULL,'男',NULL,NULL,'在學',NULL,'2026/7/14',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'樂理','美君',NULL,NULL,NULL,'⚠姓名字跡不清（泳彬/永彬）待核，資料極少'
where not exists (select 1 from public.students where name = '林永彬');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '黃子洧',NULL,'男','101/3/17','福和國中','在學','115/4/18','2026/7/14',NULL,NULL,'王芷臻','0913617705',NULL,'Ryan媽媽',NULL,'Google',NULL,NULL,'爵士鼓','宇群','個別 7200',NULL,NULL,'舊生 7200。⚠姓名/母姓名字跡待核'
where not exists (select 1 from public.students where name = '黃子洧');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '朱筱雯',NULL,'女','75/4/4',NULL,'在學','114/8/14','114/8/14',NULL,NULL,NULL,NULL,'本人 0987575824',NULL,NULL,'Google Map',NULL,NULL,'鋼琴','奕寬',NULL,NULL,NULL,'成人學生（本人聯絡）。同時為朱晅毅之母'
where not exists (select 1 from public.students where name = '朱筱雯');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '朱晅毅',NULL,'男','104/12/12',NULL,'在學','114/8/14','114/8/14',NULL,NULL,'朱筱雯','0987575824','媽',NULL,NULL,'Google Map',NULL,NULL,'爵士鼓, 樂理','宇群, 奕寬',NULL,NULL,NULL,'晅毅價格調整（2026/6/19）。⚠姓名字跡待核'
where not exists (select 1 from public.students where name = '朱晅毅');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '王薪睿',NULL,'男','108/10/12',NULL,'在學',NULL,NULL,NULL,NULL,NULL,NULL,'爸+媽',NULL,NULL,'舊生',NULL,NULL,'爵士鼓','宇群',NULL,NULL,NULL,'下一期調 7200 新價（告知原價 8000）換雙軌（2026/6/19）。⚠姓名字跡待核'
where not exists (select 1 from public.students where name = '王薪睿');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '楊子豪','Joey','男','108/3/19','及人小學','在學',NULL,'115/6/5','楊博元(金融)','0913582830','林子雯(運輸)','0920031665','爸',NULL,'中和區永和路2巷',NULL,NULL,'C2','爵士鼓, 樂理','宇群, 美君',NULL,NULL,NULL,'2025/9 已入學；2027/2 到期新價（2026/6/18）。繳費 2026/4/10'
where not exists (select 1 from public.students where name = '楊子豪');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '李淳睿','ori','男','109/5/4',NULL,'在學','114/9/27','114/9/27',NULL,NULL,NULL,'0989187990','媽',NULL,NULL,NULL,NULL,'D4','爵士鼓, 樂理','宇群, 奕寬','雙軌 1300',NULL,NULL,'2027/9 入學；目前收 1300 雙軌，積極協助併班，併班後照團班雙軌 1200×2（2026/6/18）'
where not exists (select 1 from public.students where name = '李淳睿');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '陳品言',NULL,'男','109/7/9',NULL,'在學','114/10/25','114/10/25','陳建廷','0960526061',NULL,NULL,'爸',NULL,NULL,'DM',NULL,'C2','爵士鼓, 樂理','宇群, 美君',NULL,NULL,NULL,'約 2027/2 到期，價格照新價算（2026/6/18）。繳費 2026/1/3 年繳。⚠姓名字跡待核'
where not exists (select 1 from public.students where name = '陳品言');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '李依瑾',NULL,'女',NULL,NULL,'在學','2026/6/20','2026/6/20',NULL,NULL,'林苑綺',NULL,NULL,NULL,NULL,'舊生介紹','妹妹晨希介紹',NULL,'爵士鼓','宇群','個別 7600',NULL,NULL,'姐姐。個別 $8000×0.95=7600（口碑 5 折優待）。⚠母『林苑綺』沿用妹妹卡；姓名字跡待核'
where not exists (select 1 from public.students where name = '李依瑾');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '李晨希',NULL,'女','107/10/17','秀朗國小','在學','114/7/26','114/7/26',NULL,NULL,'林苑綺','0926586952',NULL,NULL,'中和區興南路一段','Google Map',NULL,'C1','鋼琴, 樂理','美君',NULL,NULL,NULL,'妹妹。8月學費以新價算，6月做告知（2026/6/18）。介紹姐姐李依瑾入學'
where not exists (select 1 from public.students where name = '李晨希');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '王可晴',NULL,'女','100/11/24','中和國中','在學',NULL,'114/4/9',NULL,'0983850187',NULL,'0933040857','媽',NULL,NULL,NULL,NULL,NULL,'鋼琴, 樂理','奕寬, 奕寬','雙軌 14400',NULL,NULL,'⚠姓名字跡待核'
where not exists (select 1 from public.students where name = '王可晴');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '高維劭',NULL,'男',NULL,NULL,'在學','114/8/10','114/8/10','高德勝(保險)','0920142110','曾亭茵(保險)','0926811825','媽',NULL,'新店安興路83-1號4F',NULL,NULL,'D1','小提琴, 樂理','蓁芸',NULL,NULL,NULL,'7月告知，9月新價（2026/6/18）。繳費近 5/14。⚠姓名手寫近『高繼勁』，依 Overture/兄弟關係判為高維劭，待核'
where not exists (select 1 from public.students where name = '高維劭');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '高睿辰',NULL,'男','109/2/2','新和附幼','在學','114/8/10','114/8/10','高德勝(保險)','0920142110','曾亭茵(保險)','0926811825','媽',NULL,'新店安興路83-1號4F',NULL,NULL,'C2','長笛, 樂理','美君','雙軌 12000',NULL,NULL,'8月換新價（12000）（2026/6/18）。繳費最近一次 5/1。與高維劭為兄弟'
where not exists (select 1 from public.students where name = '高睿辰');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '丁紹明',NULL,'女','1986/11/10',NULL,'在學','114/9/23','114/9/23',NULL,NULL,NULL,NULL,'本人 0917861669',NULL,NULL,'股東推薦','股東推薦',NULL,'小提琴','蓁芸',NULL,NULL,NULL,'成人學生（本人聯絡）。⚠姓名手寫待核'
where not exists (select 1 from public.students where name = '丁紹明');

insert into public.students (name,nickname,gender,birthday,school,status,enrolled_on,filed_on,father_name,father_phone,mother_name,mother_phone,main_contact,line_name,address,source,referrer_note,class_slot,instrument,teacher,current_plan,deposit_amount,deposit_note,notes)
select '林品霏',NULL,'女','111/1/9',NULL,'在學','114/9/25','114/9/25',NULL,'0928928985',NULL,'0919034573','媽',NULL,NULL,NULL,NULL,'B2','兒音','美君',NULL,NULL,NULL,'2029/4 安排升班新價（2026/6/18）。⚠姓名字跡待核'
where not exists (select 1 from public.students where name = '林品霏');

-- 首次/近期繳費 → 收費紀錄（有明確金額者）
insert into public.student_fee_records (student_id, charged_on, plan, amount, collected_by, note)
select id, current_date, '雙軌', 12000, NULL, '首次匯入'
  from public.students where name = '徐于茹'
  and not exists (select 1 from public.student_fee_records r where r.student_id = public.students.id);

insert into public.student_fee_records (student_id, charged_on, plan, amount, collected_by, note)
select id, '2026-07-04', '個別一期', 8000, NULL, '首次匯入'
  from public.students where name = '徐子翔'
  and not exists (select 1 from public.student_fee_records r where r.student_id = public.students.id);

insert into public.student_fee_records (student_id, charged_on, plan, amount, collected_by, note)
select id, '2026-07-04', '個別一期', 8000, NULL, '首次匯入'
  from public.students where name = '陳畇忻'
  and not exists (select 1 from public.student_fee_records r where r.student_id = public.students.id);

insert into public.student_fee_records (student_id, charged_on, plan, amount, collected_by, note)
select id, current_date, '個別', 7200, NULL, '首次匯入'
  from public.students where name = '黃子洧'
  and not exists (select 1 from public.student_fee_records r where r.student_id = public.students.id);

insert into public.student_fee_records (student_id, charged_on, plan, amount, collected_by, note)
select id, current_date, '個別（95折）', 7600, NULL, '首次匯入'
  from public.students where name = '李依瑾'
  and not exists (select 1 from public.student_fee_records r where r.student_id = public.students.id);

insert into public.student_fee_records (student_id, charged_on, plan, amount, collected_by, note)
select id, current_date, '雙軌', 14400, NULL, '首次匯入'
  from public.students where name = '王可晴'
  and not exists (select 1 from public.student_fee_records r where r.student_id = public.students.id);

insert into public.student_fee_records (student_id, charged_on, plan, amount, collected_by, note)
select id, current_date, '雙軌', 12000, NULL, '首次匯入'
  from public.students where name = '高睿辰'
  and not exists (select 1 from public.student_fee_records r where r.student_id = public.students.id);

-- 介紹人連結（舊生介紹）
update public.students set referrer_student_id = (select id from public.students where name = '李晨希' limit 1)
  where name = '李依瑾';

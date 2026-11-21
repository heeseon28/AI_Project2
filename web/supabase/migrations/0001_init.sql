-- 학식 코치 초기 스키마. Supabase SQL Editor에 그대로 붙여 넣어 실행한다.

create type goal_mode as enum ('maintain', 'muscle', 'fat_loss', 'exam');
create type meal_type as enum ('breakfast', 'lunch', 'dinner');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text,
  role text not null default 'student' check (role in ('student', 'admin')),
  sex text check (sex in ('male', 'female')),
  weight_kg numeric,
  body_fat_pct numeric,
  activity_level numeric not null default 1.375, -- 활동계수 (1.2 ~ 1.9)
  goal_mode goal_mode not null default 'maintain',
  created_at timestamptz not null default now()
);

-- 가입 시 profiles 행 자동 생성
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create table menus (
  id bigint generated always as identity primary key,
  name text not null unique,
  kcal numeric not null,
  carb numeric not null,
  protein numeric not null,
  fat numeric not null,
  sodium numeric not null, -- mg
  price int,
  model_class_id int unique -- CNN 클래스 인덱스 (menu_cnn.labels.json 순서). 모델에 없는 메뉴는 null
);

create table weekly_menu (
  id bigint generated always as identity primary key,
  date date not null,
  meal meal_type not null,
  corner text not null,
  menu_id bigint not null references menus on delete cascade,
  unique (date, meal, corner, menu_id)
);

create table meal_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  eaten_at timestamptz not null default now(),
  meal meal_type not null
);
create index on meal_logs (user_id, eaten_at);

create table meal_items (
  id bigint generated always as identity primary key,
  meal_log_id bigint not null references meal_logs on delete cascade,
  menu_id bigint not null references menus,
  portion numeric not null default 1 check (portion > 0 and portion <= 3)
);

-- CNN 예측 이력: 사용자가 top-1을 고친 비율 = 실사용 정확도 (MODEL_SPEC 5절)
create table predictions (
  id bigint generated always as identity primary key,
  meal_item_id bigint not null references meal_items on delete cascade,
  predicted_menu_id bigint references menus,
  confidence numeric not null check (confidence between 0 and 1),
  model_version text not null,
  created_at timestamptz not null default now()
);

-- 선택 기능용 (스키마만 미리 만든다)
create table inbody_records (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  measured_at date not null,
  weight_kg numeric, skeletal_muscle_kg numeric, body_fat_pct numeric, bmr numeric
);
create table reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  menu_id bigint not null references menus,
  date date not null default current_date,
  rating int not null check (rating between 1 and 5),
  text text check (char_length(text) <= 200),
  sentiment numeric
);
create table badges (
  user_id uuid not null references auth.users on delete cascade,
  badge_code text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_code)
);

-- RLS: 개인 데이터는 본인만, 메뉴·식단표는 로그인 사용자 모두 읽기 / 관리자만 쓰기
alter table profiles enable row level security;
alter table menus enable row level security;
alter table weekly_menu enable row level security;
alter table meal_logs enable row level security;
alter table meal_items enable row level security;
alter table predictions enable row level security;
alter table inbody_records enable row level security;
alter table reviews enable row level security;
alter table badges enable row level security;

create policy "own profile read" on profiles for select using (id = auth.uid());
create policy "own profile update" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- role은 본인이 못 바꾸게 컬럼 권한으로 막는다 (관리자 지정은 SQL Editor에서 직접)
revoke update on profiles from authenticated, anon;
grant update (nickname, sex, weight_kg, body_fat_pct, activity_level, goal_mode) on profiles to authenticated;

-- 메뉴·식단표는 공개 정보라 로그인 없이도 읽는다 (인식 화면 체험용)
create policy "menus read" on menus for select using (true);
create policy "menus admin write" on menus for all using (is_admin()) with check (is_admin());
create policy "weekly read" on weekly_menu for select using (true);
create policy "weekly admin write" on weekly_menu for all using (is_admin()) with check (is_admin());

create policy "own logs" on meal_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own items" on meal_items for all
  using (exists (select 1 from meal_logs l where l.id = meal_log_id and l.user_id = auth.uid()))
  with check (exists (select 1 from meal_logs l where l.id = meal_log_id and l.user_id = auth.uid()));

create policy "own predictions" on predictions for all
  using (exists (select 1 from meal_items i join meal_logs l on l.id = i.meal_log_id where i.id = meal_item_id and l.user_id = auth.uid()))
  with check (exists (select 1 from meal_items i join meal_logs l on l.id = i.meal_log_id where i.id = meal_item_id and l.user_id = auth.uid()));

create policy "own inbody" on inbody_records for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reviews read" on reviews for select to authenticated using (true);
create policy "own reviews write" on reviews for insert with check (user_id = auth.uid());
create policy "own badges" on badges for select using (user_id = auth.uid());

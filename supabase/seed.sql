-- ============================================================================
-- Brainy Quiz Backend - Test Data Seed
-- Description: 실제 퀴즈 앱 테스트를 위한 한국어 퀴즈 문제 데이터
-- ============================================================================

-- 인물 카테고리 문제들
INSERT INTO quiz_questions (id, category, question, options, correct_answer, difficulty, explanation, is_active) VALUES
(gen_random_uuid(), 'person', '세종대왕이 만든 한글의 원래 이름은 무엇인가요?', '["훈민정음", "한글", "조선글", "민족문자"]', 0, 'medium', '1443년 세종대왕이 창제한 한글의 원래 이름은 훈민정음입니다.', true),
(gen_random_uuid(), 'person', '이순신이 임진왜란에서 승리한 유명한 해전은?', '["명량대첩", "한산도대첩", "부산포대첩", "칠천량대첩"]', 0, 'easy', '1597년 이순신이 13척의 배로 333척의 일본 함대를 물리친 전투입니다.', true),
(gen_random_uuid(), 'person', '일제강점기 독립운동가로 유명한 "안중근"이 저격한 일본의 인물은?', '["이토 히로부미", "데라우치 마사타케", "야마가타 아리토모", "가쓰라 다로"]', 0, 'medium', '1909년 하얼빈역에서 조선 침략의 원흉 이토 히로부미를 저격했습니다.', true),
(gen_random_uuid(), 'person', '"겨레의 큰 스승"으로 불리는 조선 후기의 실학자는?', '["다산 정약용", "연암 박지원", "추사 김정희", "위당 정인보"]', 0, 'hard', '실학을 집대성한 조선 후기의 대표적인 실학자입니다.', true),
(gen_random_uuid(), 'person', '6.25 전쟁 당시 유엔군 총사령관이었던 미국의 장군은?', '["맥아더", "아이젠하워", "패튼", "브래들리"]', 0, 'medium', '인천상륙작전을 성공시킨 미국의 5성 장군입니다.', true);

-- 일반상식 카테고리 문제들  
INSERT INTO quiz_questions (id, category, question, options, correct_answer, difficulty, explanation, is_active) VALUES
(gen_random_uuid(), 'general', '태양계에서 가장 큰 행성은 무엇인가요?', '["목성", "토성", "해왕성", "천왕성"]', 0, 'easy', '목성은 태양계에서 가장 큰 행성으로 지구의 11배 크기입니다.', true),
(gen_random_uuid(), 'general', '물의 화학 기호는 무엇인가요?', '["H2O", "CO2", "NaCl", "CH4"]', 0, 'easy', '물은 수소 2개와 산소 1개로 이루어진 화합물입니다.', true),
(gen_random_uuid(), 'general', '세계에서 가장 높은 산은?', '["에베레스트", "K2", "칸첸중가", "로체"]', 0, 'easy', '에베레스트산은 해발 8,849m로 세계에서 가장 높은 산입니다.', true),
(gen_random_uuid(), 'general', '인체에서 가장 큰 장기는 무엇인가요?', '["간", "폐", "신장", "심장"]', 0, 'medium', '간은 인체에서 가장 큰 내장 기관으로 해독 작용을 합니다.', true),
(gen_random_uuid(), 'general', '빛의 삼원색은 빨강, 초록과 함께 무엇인가요?', '["파랑", "노랑", "보라", "주황"]', 0, 'medium', '빛의 삼원색은 빨강(Red), 초록(Green), 파랑(Blue)입니다.', true),
(gen_random_uuid(), 'general', '지구의 자전 주기는 몇 시간인가요?', '["24시간", "23시간", "25시간", "22시간"]', 0, 'easy', '지구는 약 24시간마다 한 바퀴 자전합니다.', true);

-- 국가 카테고리 문제들
INSERT INTO quiz_questions (id, category, question, options, correct_answer, difficulty, explanation, is_active) VALUES
(gen_random_uuid(), 'country', '프랑스의 수도는 어디인가요?', '["파리", "마르세유", "리옹", "니스"]', 0, 'easy', '파리는 프랑스의 수도이자 최대 도시입니다.', true),
(gen_random_uuid(), 'country', '피라미드로 유명한 이집트의 수도는?', '["카이로", "알렉산드리아", "룩소르", "아스완"]', 0, 'easy', '카이로는 이집트의 수도이며 기자의 피라미드가 근처에 있습니다.', true),
(gen_random_uuid(), 'country', '캥거루와 코알라의 원산지인 나라는?', '["오스트레일리아", "뉴질랜드", "파푸아뉴기니", "인도네시아"]', 0, 'easy', '오스트레일리아는 캥거루와 코알라의 원산지입니다.', true),
(gen_random_uuid(), 'country', '마추픽추 유적지가 있는 남미 국가는?', '["페루", "볼리비아", "에콰도르", "콜롬비아"]', 0, 'medium', '마추픽추는 페루에 있는 잉카 문명의 유적지입니다.', true),
(gen_random_uuid(), 'country', '유로화를 사용하지 않는 유럽 국가는?', '["영국", "독일", "프랑스", "이탈리아"]', 0, 'medium', '영국은 파운드화를 사용하며 유로존에 속하지 않습니다.', true),
(gen_random_uuid(), 'country', '세계에서 가장 인구가 많은 나라는?', '["중국", "인도", "미국", "인도네시아"]', 0, 'easy', '중국은 약 14억 명으로 세계에서 가장 인구가 많은 나라입니다.', true);

-- 드라마 카테고리 문제들
INSERT INTO quiz_questions (id, category, question, options, correct_answer, difficulty, explanation, is_active) VALUES
(gen_random_uuid(), 'drama', '"겨울연가"의 남주인공 배우는?', '["배용준", "원빈", "현빈", "이병헌"]', 0, 'easy', '한류 스타 배용준이 강준상 역을 맡았습니다.', true),
(gen_random_uuid(), 'drama', '"대장금"에서 주인공 장금이를 연기한 배우는?', '["이영애", "김희선", "전지현", "송혜교"]', 0, 'easy', '이영애가 서장금 역으로 큰 인기를 얻었습니다.', true),
(gen_random_uuid(), 'drama', '"태양의 후예"에서 유시진 역을 맡은 배우는?', '["송중기", "송강호", "이민호", "김수현"]', 0, 'easy', '송중기가 특전사 대위 유시진 역을 연기했습니다.', true),
(gen_random_uuid(), 'drama', '"SKY 캐슬"에서 치열한 교육 경쟁을 그린 드라마의 배경은?', '["강남구", "서초구", "송파구", "용산구"]', 0, 'medium', 'SKY 캐슬은 강남구의 고급 주거단지를 배경으로 합니다.', true),
(gen_random_uuid(), 'drama', '"기생충"으로 아카데미상을 받은 감독은?', '["봉준호", "박찬욱", "김기덕", "이창동"]', 0, 'medium', '봉준호 감독이 기생충으로 아카데미 4개 부문을 수상했습니다.', true);

-- 음악 카테고리 문제들
INSERT INTO quiz_questions (id, category, question, options, correct_answer, difficulty, explanation, is_active) VALUES
(gen_random_uuid(), 'music', 'BTS의 리더는 누구인가요?', '["RM", "진", "슈가", "제이홉"]', 0, 'easy', 'RM(김남준)이 BTS의 리더이자 메인 래퍼입니다.', true),
(gen_random_uuid(), 'music', '"강남스타일"로 세계적으로 유명해진 가수는?', '["PSY", "빅뱅", "슈퍼주니어", "동방신기"]', 0, 'easy', 'PSY(싸이)의 강남스타일이 전 세계적으로 대히트했습니다.', true),
(gen_random_uuid(), 'music', '한국 전통 악기 중 현악기는?', '["가야금", "장구", "꽹과리", "북"]', 0, 'medium', '가야금은 12현의 한국 전통 현악기입니다.', true),
(gen_random_uuid(), 'music', '"아리랑"은 어느 지역의 민요인가요?', '["전국", "경기도", "전라도", "경상도"]', 0, 'medium', '아리랑은 한국 전체에 걸친 대표적인 민요입니다.', true),
(gen_random_uuid(), 'music', 'BLACKPINK의 데뷔곡은?', '["BOOMBAYAH", "DDU-DU DDU-DU", "Kill This Love", "How You Like That"]', 0, 'hard', 'BLACKPINK는 2016년 BOOMBAYAH로 데뷔했습니다.', true),
(gen_random_uuid(), 'music', '서태지와 아이들의 대표곡은?', '["난 알아요", "하여가", "교실이데아", "컴백홈"]', 0, 'medium', '1992년 발표된 "난 알아요"가 서태지와 아이들의 데뷔곡이자 대표곡입니다.', true);

-- 퀴즈 버전 정보 추가 (충돌 방지)
INSERT INTO quiz_versions (id, version_number, description, question_count, categories, is_active, published_at) VALUES 
(gen_random_uuid(), '1.0.1', '초기 테스트 데이터 - 28개 한국어 문제', 28, '["person", "general", "country", "drama", "music"]', true, NOW())
ON CONFLICT (version_number) DO NOTHING;

-- 기본 사용자 역할에 테스트 사용자 할당 (이미 생성된 사용자가 있다면)
INSERT INTO user_role_assignments (user_id, role_id, assigned_by, assigned_at) 
SELECT u.id, r.id, u.id, NOW()
FROM users u, user_roles r 
WHERE u.email LIKE '%@example.com' AND r.role_name = 'basic_user'
ON CONFLICT (user_id, role_id) DO NOTHING; 
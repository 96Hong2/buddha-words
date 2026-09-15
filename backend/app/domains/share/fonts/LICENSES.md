# 공유 카드 글꼴

서버가 카드를 그리므로 글꼴 파일이 배포에 함께 들어가야 한다. 리눅스 컨테이너에는 한글 글꼴이
없어서, 없으면 카드 글자가 전부 네모(두부)로 그려진다. 그래서 여기 둔다.

| 파일 | 글꼴 | 판 | 라이선스 | 받은 곳 |
| --- | --- | --- | --- | --- |
| `Pretendard-Medium.otf` `Pretendard-SemiBold.otf` `Pretendard-Bold.otf` | Pretendard | v1.3.9 | SIL Open Font License 1.1 | https://github.com/orioncactus/pretendard |
| `MaruBuri-Regular.otf` `MaruBuri-Bold.otf` | 마루 부리 (네이버) | 1.000 | 네이버 오픈 라이선스 (상업적 사용 허용) | https://hangeul.naver.com/font/maruburi |

Pretendard 는 OFL 이라 제품에 넣어 함께 배포할 수 있다는 것이 저장소 LICENSE 에 명시돼 있다.

마루 부리는 배포처가 「오픈 라이선스 · 상업적 사용 허용」이라고만 적어 두었고, 글꼴 파일의
name 테이블에도 라이선스 조항이 비어 있다. **제품에 임베드해 재배포해도 되는지는 심사 제출 전에
배포처 약관 원문으로 한 번 확인하고 여기에 결론을 적는다.** 막히면 경전·제목도 Pretendard 로
내려앉히고 카드를 다시 뽑는다(`fonts.FILES` 의 `serif`·`serif_bold` 두 줄만 바꾸면 된다).

## 다시 받기

```bash
D=backend/app/domains/share/fonts
P=https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static
for f in Pretendard-Medium.otf Pretendard-SemiBold.otf Pretendard-Bold.otf; do curl -fL -o "$D/$f" "$P/$f"; done

M=https://raw.githubusercontent.com/fonts-archive/MaruBuri/main
for f in MaruBuri-Regular.otf MaruBuri-Bold.otf; do curl -fL -o "$D/$f" "$M/$f"; done
```

받은 뒤 `app/domains/share/fonts.py` 의 `verify()` 가 한글 글리프까지 확인한다. 통과하지 못하면
앱이 뜨지 않는다.

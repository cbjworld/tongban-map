# tongban-map — 통·리·반 지도 (공개 베타)

전국 읍면동을 선택해 통·행정리·반 경계를 그리고, JSON으로 저장·조회하는 정적 웹 도구입니다.

## 예시 웹사이트

- [지도 뷰어 열기](https://cbjworld.github.io/tongban-map/)
- [통·리·반 경계 편집기 열기](https://cbjworld.github.io/tongban-map/editor.html)

설치나 API 키 없이 브라우저에서 사용할 수 있습니다. 작성한 경계는 JSON으로 PC에 저장하세요. 예시 사이트에 작업 내용이 저장되거나 다른 사용자에게 공유되지는 않습니다.

## 실행

```sh
python -m http.server 8000
```

- http://localhost:8000/index.html : 읽기 전용 뷰어. 작성한 JSON을 불러오고 구역을 클릭해 이동합니다.
- http://localhost:8000/editor.html : 경계 그리기, 꼭짓점 편집, 필지 편입, JSON·CSV 내보내기.
- API 키 없이 OpenStreetMap 배경지도를 사용합니다. 지도 타일과 Leaflet CDN은 인터넷 연결이 필요합니다.
- 더블클릭으로 file://에서 열지 말고 HTTP 서버를 사용하세요.

## 기본 사용

1. 시도 → 시군구 → 읍면동을 선택합니다. 선택한 지역 경계와 보유 필지만 읽으며, 이전 지역의 데이터와 레이어는 교체합니다.
2. 동은 통·반, 읍·면은 행정리·반으로 자동 설정됩니다. 구분 선택에서 직접 바꿀 수도 있습니다.
3. 통/리 번호로 구역을 만들고 목록에서 이름을 입력합니다. 반은 해당 통/리에 속합니다. 법정리 원본을 행정리로 자동 변환하지 않습니다.
4. JSON을 PC에 저장합니다. 번호·이름·구분·지역 코드·외곽선·반 경계를 함께 저장합니다.
5. 뷰어에서 JSON을 불러옵니다. 예전 통 JSON도 읽지만 새 버전의 리 이름/구분/외곽선은 구버전 앱에서 유지되지 않을 수 있습니다.

점이 3개인 경계에서 점을 삭제하면 해당 조각을 삭제합니다. 남은 조각이 없으면 구역을 삭제합니다. 지역 변경과 JSON 덮어쓰기는 확인을 받으며, 잘못된 파일은 기존 작업을 유지합니다.

자동 저장은 없습니다. 새로고침·종료 전 JSON으로 내보내세요. 종료 경고는 저장 여부를 추적하지 않으므로 저장한 후에도 표시될 수 있습니다.

## 전국 필지 파일 가져오기

지역 선택 후 **필지 GeoJSON**을 누릅니다. 전국 일괄 자료가 아니라 해당 읍면동 규모로 잘라낸 파일을 사용하세요.

- UTF-8 GeoJSON FeatureCollection, WGS84(EPSG:4326), 경도·위도 순서.
- Polygon/MultiPolygon. 각 고리는 시작점과 끝점이 같아야 합니다.
- 최대 25MB, 10,000필지. 선택 지역과 겹치는 필지만 적용합니다.
- 속성: `jibun` 또는 `JIBUN`(지번), 선택적으로 `PNU`/`pnu`(19자리), `legal_name`(법정동·리명), `road_address`.
- 지번이 없고 PNU가 있으면 PNU로 지번을 생성합니다. 같은 지번은 PNU/법정동·리명으로 구분하세요.
- 파일은 업로드하지 않습니다. 지역을 바꾸면 메모리에서 교체되므로 필요할 때 다시 가져옵니다.
- 필지 편입 후 저장되는 JSON에는 결과 경계만 포함되고 필지 원본은 포함되지 않습니다.

전국 필지 실시간 조회와 전국 필지 원본 다운로드는 구현하지 않았습니다. 인증키 없는 파일 가져오기 방식입니다. 원자료와 이용조건은 [DATA_SOURCES.md](DATA_SOURCES.md)를 확인하세요.

## 개인정보·정확도

통장·반장 이름/전화번호는 입력·내보내지 않습니다. 예전 파일의 해당 필드도 가져오지 않습니다. 통/리 이름에 개인정보를 입력하지 마세요.

동일 필지의 소속 표시는 중심점 기반의 참고 판정입니다. 복잡한 도형의 겹침 정리와 경계 정확성을 공적 원자료와 대조해야 합니다. 측량·권리관계 판단에 사용하지 마세요. 내려받은 복합 읍면동 외곽선의 꼭짓점 편집은 지원하지 않으며 새로 그리면 대체됩니다.

파일은 로컬 처리하지만 OSM 타일·Leaflet CDN 요청에는 IP와 지도 조회 범위 등 네트워크 정보가 전송됩니다. [OSM 타일 이용 정책](https://operations.osmfoundation.org/policies/tiles/)에 따라 사용하며, 대량 수집·오프라인 사전 저장 기능은 없습니다.

## 개발·검증

```sh
python check.py
npm install
npm test
python release.py
```

브라우저 테스트는 서버가 8000번에서 실행 중이고 Microsoft Edge가 설치된 환경을 사용합니다. 테스트 중 OSM 타일 요청은 차단합니다. 새 앱 의존성은 없고 Playwright는 개발 테스트용입니다.

다른 포트·하위 경로를 검증하려면 `BASE_URL` 환경변수를 지정합니다(예: `http://127.0.0.1:8001/tongban-map/`, 끝의 슬래시 포함).

화면 원본은 `src/editor_template.html`, `src/viewer_template.html`입니다. `python build.py`로 생성합니다. `prepare_regions.py`는 다운로드한 전국 GeoJSON 경로를 인자로 받아 분할합니다. 원본 옆에 LICENSE-DATA가 있어야 합니다.

`release.py`는 허용된 파일만 검사하고 상위 폴더에 `tongban-map-beta.zip`을 만듭니다. 비밀값 패턴·기존 개인정보 필드를 검사하지만 모든 민감정보를 식별하는 보안 감사는 아닙니다.

## 배포·라이선스

압축을 풀어 정적 호스팅에 폴더 전체를 올릴 수 있습니다. `data/regions` 경로를 유지하세요. GitHub Pages에서는 Settings → Pages → Deploy from a branch → `main` / `(root)`로 설정합니다. 예시 웹사이트는 GitHub Pages에서 제공합니다.

앱 코드는 MIT입니다([LICENSE](LICENSE)). 데이터·제3자 코드는 별도 조건을 따릅니다. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [DATA_SOURCES.md](DATA_SOURCES.md)를 함께 배포하세요.

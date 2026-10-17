var workPrefix = 'tongban-map:work:v1:';
function lastWorkRegion() {
  try { return localStorage.getItem(workPrefix + 'last') || '1117068500'; }
  catch (error) { return '1117068500'; }
}
function readLocalWork(code) {
  var raw = localStorage.getItem(workPrefix + code);
  if (!raw) return null;
  var work = JSON.parse(raw);
  if (work.version !== 1 || work.data.head.REGION_CODE !== code) throw new Error('저장 데이터 형식 오류');
  work.parsed = parseMapData(work.data);
  if (work.draft) {
    if (!['tong', 'ban', 'boundary'].includes(work.draft.mode) || !Array.isArray(work.draft.points) ||
        work.draft.points.length > 200000 || work.draft.points.some(function (point) {
          return !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) ||
            Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90;
        })) throw new Error('그리기 임시 저장 오류');
  }
  return { raw: raw, value: work };
}

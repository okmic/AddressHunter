const fs = require('fs');
const path = require('path');

async function main() {
  // Пути к файлам
  const avitoPath = path.join(__dirname, '../feed.xml');
  const nmarketPath = path.join(__dirname, '../New_developments.xml');
  const logFilePath = path.join(__dirname, 'found_results.txt');

  // Очистка файла логов
  fs.writeFileSync(logFilePath, 'Лог сравнения адресов:\n\n');

  try {
    // 1. Чтение и парсинг файла Avito
    console.log('Загрузка файла Avito...');
    const avitoXml = fs.readFileSync(avitoPath, 'utf-8');
    const avitoOffers = parseAvitoXml(avitoXml);
    console.log(`Найдено ${avitoOffers.length} предложений в Avito`);

    // 2. Чтение и парсинг файла Nmarket
    console.log('Загрузка файла Nmarket...');
    const nmarketXml = fs.readFileSync(nmarketPath, 'utf-8');
    const nmarketOffers = parseNmarketXml(nmarketXml);
    console.log(`Найдено ${nmarketOffers.length} предложений в Nmarket`);

    if (nmarketOffers.length === 0) {
      throw new Error('Не найдено предложений в файле Nmarket');
    }

    // 3. Поиск совпадений
    console.log('\nНачинаем поиск совпадений...');
    const matches = findMatches(avitoOffers, nmarketOffers);

    // 4. Запись результатов
    fs.appendFileSync(logFilePath, `Всего совпадений: ${matches.length}\n\n`);
    
    matches.forEach(match => {
      const logLine = `Avito ID: ${match.avitoId} -> Nmarket ID: ${match.nmarketId}\n` +
                     `Адрес Avito: ${match.avitoAddress}\n` +
                     `Адрес Nmarket: ${match.nmarketAddress}\n` +
                     `Сходство: ${(match.similarity * 100).toFixed(2)}%\n` +
                     '----------------------------------------\n';
      fs.appendFileSync(logFilePath, logLine);
      console.log(logLine);
    });

    console.log(`\nОбработка завершена. Результаты записаны в: ${logFilePath}`);

  } catch (err) {
    const errorMsg = `Ошибка: ${err.message}\n`;
    fs.appendFileSync(logFilePath, errorMsg);
    console.error(errorMsg);
    process.exit(1);
  }
}

// Парсинг Avito XML через регулярки
function parseAvitoXml(xml) {
  const offerRegex = /<offer\s+internal-id="([^"]+)"[^>]*>([\s\S]*?)<\/offer>/g;
  const offers = [];
  let match;

  while ((match = offerRegex.exec(xml)) !== null) {
    const id = match[1];
    const content = match[2];
    
    // Извлекаем адрес
    const addressMatch = content.match(/<address>([^<]+)<\/address>/);
    const localityMatch = content.match(/<locality-name>([^<]+)<\/locality-name>/);
    
    let address = '';
    if (addressMatch) address = addressMatch[1];
    else if (localityMatch) address = localityMatch[1];
    
    if (address) {
      offers.push({
        id: id,
        address: address.trim(),
        normalized: normalizeAddress(address)
      });
    }
  }

  return offers;
}

// Парсинг Nmarket XML через регулярки
function parseNmarketXml(xml) {
  const objectRegex = /<Object\s+id="([^"]+)"[^>]*address="([^"]+)"[^>]*>([\s\S]*?)<\/Object>/g;
  const housingRegex = /<Housing\s+id="([^"]+)"[^>]*address="([^"]+)"[^>]*>/g;
  const offers = [];
  let match;

  // Обрабатываем основные Object
  while ((match = objectRegex.exec(xml)) !== null) {
    offers.push({
      id: match[1],
      address: match[2].trim(),
      normalized: normalizeAddress(match[2])
    });

    // Обрабатываем вложенные Housing
    const housingContent = match[3];
    let housingMatch;
    while ((housingMatch = housingRegex.exec(housingContent)) !== null) {
      offers.push({
        id: housingMatch[1],
        address: housingMatch[2].trim(),
        normalized: normalizeAddress(housingMatch[2])
      });
    }
  }

  return offers;
}

// Нормализация адреса
function normalizeAddress(addr) {
  if (!addr) return '';
  
  return addr.toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bд(ом)?\b/g, 'д')
    .replace(/\bул(ица)?\b/g, 'ул')
    .replace(/\bпр(оспект)?\b/g, 'пр')
    .replace(/\bбульвар\b/g, 'б-р')
    .replace(/\bпереулок\b/g, 'пер')
    .replace(/\bшоссе\b/g, 'ш')
    .replace(/\bлитер\b/g, 'лит')
    .replace(/\bстроение\b/g, 'стр')
    .replace(/\bквартал\b/g, 'кв-л')
    .replace(/[^\wа-яё0-9\s-]/gi, '')
    .trim();
}

// Поиск совпадений между массивами
function findMatches(avitoOffers, nmarketOffers) {
  const matches = [];
  const similarityThreshold = 0.7;

  avitoOffers.forEach(avitoOffer => {
    let bestMatch = null;
    let maxSimilarity = 0;

    nmarketOffers.forEach(nmarketOffer => {
      const similarity = calculateSimilarity(
        avitoOffer.normalized,
        nmarketOffer.normalized
      );

      if (similarity > maxSimilarity && similarity >= similarityThreshold) {
        maxSimilarity = similarity;
        bestMatch = nmarketOffer;
      }
    });

    if (bestMatch) {
      matches.push({
        avitoId: avitoOffer.id,
        nmarketId: bestMatch.id,
        avitoAddress: avitoOffer.address,
        nmarketAddress: bestMatch.address,
        similarity: maxSimilarity
      });
    }
  });

  return matches;
}

// Расчет схожести строк (0-1)
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  const levenshteinSimilarity = 1 - (distance / maxLength);

  const words1 = str1.split(' ');
  const words2 = str2.split(' ');
  const commonWords = words1.filter(word => words2.includes(word));
  const wordSimilarity = commonWords.length / Math.max(words1.length, words2.length);

  return (levenshteinSimilarity + wordSimilarity) / 2;
}

// Алгоритм Левенштейна
function levenshteinDistance(str1, str2) {
  if (!str1) return str2 ? str2.length : 0;
  if (!str2) return str1.length;

  const matrix = [];
  for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      const cost = str2[i-1] === str1[j-1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i-1][j] + 1,
        matrix[i][j-1] + 1,
        matrix[i-1][j-1] + cost
      );
    }
  }

  return matrix[str2.length][str1.length];
}

// Запуск
main().catch(err => {
  console.error('Ошибка:', err);
  process.exit(1);
});
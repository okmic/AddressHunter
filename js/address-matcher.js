const fs = require('fs');
const { join } = require('path');
const levenshtein = require('fast-levenshtein');
const { createLogger, format, transports } = require('winston');

// Настройка логгера
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${message}`)
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: join(__dirname, 'address-matching.log') })
  ]
});

// Токенизация адреса
function tokenizeAddress(address) {
  if (!address) return [];
  
  return address
    .toLowerCase()
    .replace(/[.,]/g, '')
    .split(/\s+/)
    .filter(token => token.length > 2);
}

// Нормализация токенов
function normalizeTokens(tokens) {
  const replacements = {
    'ул': 'улица',
    'улицы': 'улица',
    'пр': 'проспект',
    'проспекта': 'проспект',
    'пер': 'переулок',
    'переулка': 'переулок',
    'д': 'дом',
    'дом': 'дом',
    'к': 'корпус',
    'корп': 'корпус',
    'корпуса': 'корпус',
    'л': 'литера',
    'литер': 'литера',
    'лит': 'литера'
  };
  
  return tokens.map(token => replacements[token] || token);
}

// Сравнение токенов
function compareTokens(tokens1, tokens2) {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

// Сравнение адресов
function compareAddresses(addr1, addr2) {
  try {
    if (!addr1 || !addr2) return 0;
    
    addr1 = String(addr1).trim();
    addr2 = String(addr2).trim();
    
    if (addr1 === addr2) {
      logger.debug(`Точное совпадение: "${addr1}" == "${addr2}"`);
      return 1.0;
    }

    const maxLen = Math.max(addr1.length, addr2.length);
    const levDist = levenshtein.get(addr1, addr2);
    const levScore = maxLen > 0 ? 1 - (levDist / maxLen) : 0;

    const tokens1 = normalizeTokens(tokenizeAddress(addr1));
    const tokens2 = normalizeTokens(tokenizeAddress(addr2));
    const tokenScore = compareTokens(tokens1, tokens2);

    const combinedScore = (levScore * 0.4) + (tokenScore * 0.6);

    logger.debug(`Сравнение: "${addr1}" vs "${addr2}"`);
    logger.debug(`  Расстояние Левенштейна: ${levScore.toFixed(2)}`);
    logger.debug(`  Совпадение токенов: ${tokenScore.toFixed(2)}`);
    logger.debug(`  Итоговый score: ${combinedScore.toFixed(2)}`);

    return combinedScore;
  } catch (error) {
    logger.error(`Ошибка при сравнении адресов: ${error.message}`);
    return 0;
  }
}

// Загрузка данных
function loadData() {
  try {
    logger.info('Загрузка данных из JSON файлов...');
    
    const nmarketPath = join(__dirname, '..', 'nmarket_addresses.json');
    const newDevPath = join(__dirname, '..', 'new_dev_addresses.json');
    
    if (!fs.existsSync(nmarketPath)) throw new Error(`Файл не найден: ${nmarketPath}`);
    if (!fs.existsSync(newDevPath)) throw new Error(`Файл не найден: ${newDevPath}`);
    
    const nmarketData = JSON.parse(fs.readFileSync(nmarketPath, 'utf8'));
    const newDevData = JSON.parse(fs.readFileSync(newDevPath, 'utf8'));
    
    if (!Array.isArray(nmarketData)) throw new Error('nmarket_addresses.json должен содержать массив');
    if (!Array.isArray(newDevData)) throw new Error('new_dev_addresses.json должен содержать массив');
    
    logger.info(`Загружено ${nmarketData.length} адресов из nmarket и ${newDevData.length} из newDev`);
    return { nmarketData, newDevData };
  } catch (error) {
    logger.error(`Ошибка загрузки данных: ${error.message}`);
    process.exit(1);
  }
}

// Поиск совпадений
function findMatches(nmarketData, newDevData, threshold = 0.7) {
  const matches = [];
  logger.info(`Начало поиска совпадений (порог: ${threshold})...`);
  
  try {
    // Предварительная обработка адресов newDev для ускорения
    const newDevMap = newDevData.map(item => ({
      ...item,
      tokens: normalizeTokens(tokenizeAddress(item.unified || ''))
    }));

    for (let i = 0; i < nmarketData.length; i++) {
      const nmItem = nmarketData[i];
      if (!nmItem.unified) continue;
      
      const nmTokens = normalizeTokens(tokenizeAddress(nmItem.unified));
      let bestMatch = null;
      let bestScore = 0;

      for (const devItem of newDevMap) {
        if (!devItem.unified) continue;
        
        // Быстрая проверка по токенам
        const quickTokenScore = compareTokens(nmTokens, devItem.tokens);
        if (quickTokenScore < 0.3) continue;
        
        const score = compareAddresses(nmItem.unified, devItem.unified);
        
        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestMatch = {
            nmarket: nmItem,
            newDev: devItem,
            score: score
          };
        }
      }

      if (bestMatch) {
        matches.push(bestMatch);
        if (matches.length % 100 === 0) {
          logger.info(`Найдено ${matches.length} совпадений...`);
        }
      }
    }
  } catch (error) {
    logger.error(`Ошибка в процессе поиска совпадений: ${error.message}`);
  }

  logger.info(`Поиск завершен. Всего совпадений: ${matches.length}`);
  return matches;
}

// Сохранение результатов
function saveResults(matches) {
  try {
    const result = {
      timestamp: new Date().toISOString(),
      totalMatches: matches.length,
      matches: matches.map(m => ({
        score: m.score,
        nmarket: {
          original: m.nmarket.original,
          position: m.nmarket.position,
          source: m.nmarket.source
        },
        newDev: {
          original: m.newDev.original,
          position: m.newDev.position,
          source: m.newDev.source
        }
      }))
    };

    const resultPath = join(__dirname, '..', 'common_addresses.json');
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    logger.info(`Результаты сохранены в ${resultPath}`);

    // Генерация CSV отчета
    if (matches.length > 0) {
      const csvPath = join(__dirname, '..', 'matches_report.csv');
      const csvHeader = 'Score,NMarket Address,NMarket Position,NewDev Address,NewDev Position\n';
      const csvContent = matches.map(m => 
        `${m.score.toFixed(2)},"${m.nmarket.original}",${m.nmarket.position},"${m.newDev.original}",${m.newDev.position}`
      ).join('\n');
      
      fs.writeFileSync(csvPath, csvHeader + csvContent);
      logger.info(`CSV отчет сохранен в ${csvPath}`);
    }
  } catch (error) {
    logger.error(`Ошибка сохранения результатов: ${error.message}`);
  }
}

// Основная функция
async function main() {
  try {
    const { nmarketData, newDevData } = loadData();
    
    if (nmarketData.length === 0 || newDevData.length === 0) {
      logger.error('Один из массивов адресов пуст. Прерывание выполнения.');
      return;
    }
    
    // Обработка больших объемов данных пачками
    const batchSize = 5000;
    let allMatches = [];
    
    for (let i = 0; i < nmarketData.length; i += batchSize) {
      const batch = nmarketData.slice(i, i + batchSize);
      logger.info(`Обработка пачки ${i}-${Math.min(i + batchSize, nmarketData.length)} из ${nmarketData.length}...`);
      
      const matches = findMatches(batch, newDevData);
      allMatches = allMatches.concat(matches);
    }
    
    saveResults(allMatches);
    
    // Вывод сводки
    if (allMatches.length > 0) {
      logger.info('\nТоп-5 лучших совпадений:');
      allMatches
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .forEach((match, i) => {
          logger.info(`${i + 1}. Score: ${match.score.toFixed(2)}`);
          logger.info(`   NMarket: ${match.nmarket.original}`);
          logger.info(`   NewDev:  ${match.newDev.original}\n`);
        });
    }
    
    logger.info('Процесс завершен успешно');
  } catch (error) {
    logger.error(`Критическая ошибка: ${error.message}`);
    process.exit(1);
  }
}

// Запуск
main();
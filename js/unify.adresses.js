const fs = require('fs');
const { join } = require('path');
const xml2js = require('xml2js');

// Унификация адресов
function unifyAddress(address) {
  if (!address) return '';
  
  // Приведение к единому формату
  let unified = address
    .replace(/д\./g, 'д ') // унифицируем "д." и "д"
    .replace(/корп\./g, 'к') // унифицируем "корп." и "к"
    .replace(/литер/g, 'л') // унифицируем "литер" и "л"
    .replace(/\s+/g, ' ') // удаляем лишние пробелы
    .trim();
  
  // Удаляем запятые перед номерами домов
  unified = unified.replace(/(ул|улица|пер|переулок|пр|проспект|пл|площадь|б-р|бульвар|ш|шоссе),?\s+/g, '$1 ');
  
  return unified;
}

// Обработка nmarket.feed.xml
async function processNmarketFeed(filePath) {
  try {
    const xml = fs.readFileSync(filePath, 'utf8');
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xml);
    
    const addresses = [];
    
    if (result['realty-feed'] && result['realty-feed'].offer) {
      const offers = Array.isArray(result['realty-feed'].offer) 
        ? result['realty-feed'].offer 
        : [result['realty-feed'].offer];
      
      offers.forEach((offer, index) => {
        if (offer.location && offer.location.address) {
          const originalAddress = offer.location.address;
          const unifiedAddress = unifyAddress(originalAddress);
          
          addresses.push({
            original: originalAddress,
            unified: unifiedAddress,
            source: 'nmarket.feed.xml',
            position: index + 1,
            internalId: offer['$'] ? offer['$']['internal-id'] : null,
            buildingName: offer['building-name'] || null,
            buildingSection: offer['building-section'] || null
          });
        }
      });
    }
    
    return addresses;
  } catch (error) {
    console.error('Ошибка при обработке nmarket.feed.xml:', error);
    return [];
  }
}

// Обработка New_developments.xml
async function processNewDevelopments(filePath) {
  try {
    const xml = fs.readFileSync(filePath, 'utf8');
    
    // Проверяем, что файл не пустой и содержит закрывающие теги
    if (!xml.includes('</Developments>')) {
      console.warn('Файл New_developments.xml не содержит закрывающего тега </Developments>');
      return [];
    }
    
    const parser = new xml2js.Parser({ 
      explicitArray: false,
      trim: true,
      mergeAttrs: true
    });
    
    const result = await parser.parseStringPromise(xml);
    const addresses = [];
    let position = 1;
    
    function processObject(obj, parentPath = '') {
      if (!obj) return;
      
      if (obj.address) {
        const originalAddress = obj.address;
        const unifiedAddress = unifyAddress(originalAddress);
        
        addresses.push({
          original: originalAddress,
          unified: unifiedAddress,
          source: 'New_developments.xml',
          position: position++,
          path: parentPath,
          objectId: obj.id || null,
          objectName: obj.name || null,
          developer: obj.developer || null
        });
      }
      
      if (obj.Housing) {
        const housings = Array.isArray(obj.Housing) ? obj.Housing : [obj.Housing];
        const currentPath = parentPath + (obj.name ? `${obj.name}/` : '');
        
        housings.forEach(housing => {
          processObject(housing, currentPath);
        });
      }
    }
    
    if (result.Developments && result.Developments.Region) {
      const regions = Array.isArray(result.Developments.Region) 
        ? result.Developments.Region 
        : [result.Developments.Region];
      
      regions.forEach(region => {
        if (region && region.City) {
          const cities = Array.isArray(region.City) ? region.City : [region.City];
          
          cities.forEach(city => {
            if (city && city.Object) {
              const objects = Array.isArray(city.Object) ? city.Object : [city.Object];
              
              objects.forEach(obj => {
                processObject(obj, `${region.name}/${city.name}/`);
              });
            }
          });
        }
      });
    }
    
    return addresses;
  } catch (error) {
    console.error('Ошибка при обработке New_developments.xml:', error);
    return [];
  }
}

// Основная функция
async function main() {
  try {
    const nmarketAddresses = await processNmarketFeed(join(__dirname, '../feed.xml'));
    const newDevAddresses = await processNewDevelopments(join(__dirname, '../New_developments.xml'));
    
    // Сохраняем результаты
    fs.writeFileSync('nmarket_addresses.json', JSON.stringify(nmarketAddresses, null, 2));
    fs.writeFileSync('new_dev_addresses.json', JSON.stringify(newDevAddresses, null, 2));
    
    console.log('Обработка завершена. Результаты сохранены в:');
    console.log('- nmarket_addresses.json');
    console.log('- new_dev_addresses.json');
    
    // Выводим статистику
    console.log(`\nНайдено адресов в nmarket.feed.xml: ${nmarketAddresses.length}`);
    console.log(`Найдено адресов в New_developments.xml: ${newDevAddresses.length}`);
    
    // Выводим примеры
    if (newDevAddresses.length > 0) {
      console.log('\nПримеры адресов из New_developments.xml:');
      newDevAddresses.slice(0, 3).forEach(addr => {
        console.log(`Оригинал: ${addr.original}`);
        console.log(`Унифицированный: ${addr.unified}`);
        console.log(`Позиция: ${addr.position}\n`);
      });
    } else {
      console.log('\nВ New_developments.xml не найдено адресов. Проверьте целостность XML файла.');
    }
    
  } catch (error) {
    console.error('Ошибка при обработке файлов:', error);
  }
}

main();
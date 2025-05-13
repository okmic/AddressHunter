from natasha import MorphVocab, AddrExtractor, Doc, Segmenter
from pymorphy2 import MorphAnalyzer
from dataclasses import dataclass
from typing import Optional, Dict
import re

@dataclass
class NormalizedAddress:
    city: Optional[str]
    street: Optional[str]
    house: Optional[str]
    
    def to_dict(self):
        return {
            'city': self.city,
            'street': self.street,
            'house': self.house
        }

class AddressParser:
    def __init__(self):
        self.morph = MorphAnalyzer()
        self.segmenter = Segmenter()
        self.addr_extractor = AddrExtractor(MorphVocab())
        self.replacements = {
            'гор ': 'г ', 'гор.': 'г.',
            'ул ': 'улица ', 'ул.': 'улица',
            'пр ': 'проспект ', 'пр.': 'проспект',
            'д ': 'дом ', 'д.': 'дом'
        }
    
    def normalize(self, address: str) -> NormalizedAddress:
        # Простая предварительная обработка
        text = address.lower()
        for old, new in self.replacements.items():
            text = text.replace(old, new)
        
        # Сначала пробуем Natasha
        try:
            doc = Doc(text)
            doc.segment(self.segmenter)
            matches = list(self.addr_extractor(doc.text))
            if matches:
                fact = matches[0].fact
                return NormalizedAddress(
                    city=self._normalize(getattr(fact, 'city', '')),
                    street=self._normalize(getattr(fact, 'street', '')),
                    house=self._normalize_house(getattr(fact, 'house', ''))
                )
        except:
            pass
        
        # Если Natasha не сработал - простой ручной разбор
        parts = [p.strip() for p in re.split(r'[,.]\s*', text) if p.strip()]
        city = street = house = None
        if len(parts) > 0:
            city = self._normalize(parts[0])
        if len(parts) > 1:
            street = self._normalize(parts[1])
        if len(parts) > 2:
            house = self._normalize_house(parts[2])
        
        return NormalizedAddress(city, street, house)
    
    def _normalize(self, text: str) -> str:
        if not text:
            return None
        try:
            return self.morph.parse(text)[0].normal_form
        except:
            return text
    
    def _normalize_house(self, house: str) -> str:
        if not house:
            return None
        return re.sub(r'[^\dкстр]', '', house)
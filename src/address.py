from dataclasses import dataclass
from typing import Dict
from .nlp_utils import AddressParser

@dataclass
class AddressMatchResult:
    is_match: bool
    details: Dict[str, bool]
    normalized_first: Dict[str, str]
    normalized_second: Dict[str, str]

class AddressMatcher:
    def __init__(self):
        self.parser = AddressParser()
    
    def compare(self, address1: str, address2: str) -> AddressMatchResult:
        norm1 = self.parser.normalize(address1)
        norm2 = self.parser.normalize(address2)
        
        city_match = norm1.city and norm2.city and norm1.city == norm2.city
        street_match = norm1.street and norm2.street and norm1.street == norm2.street
        house_match = norm1.house and norm2.house and norm1.house == norm2.house
        
        return AddressMatchResult(
            is_match=city_match and street_match and house_match,
            details={
                'city': bool(city_match),
                'street': bool(street_match),
                'house': bool(house_match)
            },
            normalized_first=norm1.to_dict(),
            normalized_second=norm2.to_dict()
        )
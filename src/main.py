from fastapi import FastAPI
from .address import AddressMatcher
from pydantic import BaseModel

app = FastAPI()
matcher = AddressMatcher()

class CompareRequest(BaseModel):
    address1: str
    address2: str

@app.post("/compare")
async def compare_addresses(request: CompareRequest):
    """Сравнивает два адреса с использованием NLP"""
    return matcher.compare(request.address1, request.address2).__dict__

@app.get("/health")
async def health_check():
    return {"status": "OK"}
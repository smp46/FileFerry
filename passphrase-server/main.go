package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mills.io/bitcask/v2"
)

var db *bitcask.Bitcask

type address_item struct {
	Phrase string `json:"phrase"`
	Maddr  string `json:"maddr"`
}

func getAddress(c *gin.Context) {
	dbKeyString := c.Param("phrase")

	valueBytes, err := db.Get([]byte(dbKeyString))
	if err != nil {
		if err == bitcask.ErrKeyNotFound {
			c.IndentedJSON(http.StatusNotFound, gin.H{"message": "Phrase not found"})
		} else {
			log.Printf("Error retrieving key '%s' from database: %v", dbKeyString, err)
			c.IndentedJSON(http.StatusInternalServerError, gin.H{"message": "Failed to retrieve data"})
		}
		return
	}

	var item address_item
	if err := json.Unmarshal(valueBytes, &item); err != nil {
		log.Printf("Error unmarshaling data for key '%s': %v", dbKeyString, err)
		c.IndentedJSON(http.StatusInternalServerError, gin.H{"message": "Failed to process data"})
		return
	}

	c.IndentedJSON(http.StatusOK, item)
	db.Delete([]byte(dbKeyString))
}

func addAddress(c *gin.Context) {
	var newAddress address_item

	if err := c.BindJSON(&newAddress); err != nil {
		c.IndentedJSON(http.StatusBadRequest, gin.H{"message": "Invalid JSON payload: " + err.Error()})
		return
	}

	dbKeyBytes := []byte(newAddress.Phrase)
	if _, err := db.Get(dbKeyBytes); err == nil {
		c.IndentedJSON(http.StatusConflict, gin.H{"message": "Phrase already exists"})
		return
	} else if err != bitcask.ErrKeyNotFound {
		log.Printf("Error checking existence of key '%s': %v", newAddress.Phrase, err)
		c.IndentedJSON(http.StatusInternalServerError, gin.H{"message": "Error processing request"})
		return
	}

	addressBytes, err := json.Marshal(newAddress)
	if err != nil {
		log.Printf("Error marshaling new address item: %v", err)
		c.IndentedJSON(http.StatusInternalServerError, gin.H{"message": "Failed to process address data"})
		return
	}

	if err := db.Put(dbKeyBytes, addressBytes); err != nil {
		log.Printf("Error saving key '%s' to database: %v", newAddress.Phrase, err)
		c.IndentedJSON(http.StatusInternalServerError, gin.H{"message": "Failed to save address"})
		return
	}

	c.IndentedJSON(http.StatusCreated, gin.H{"message": "Address added successfully", "data": newAddress})
}

func main() {
	dbPath := "/tmp/my_bitcask_db"
	var err error
	db, err = bitcask.Open(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database at %s: %v", dbPath, err)
	}
	defer db.Close()

	log.Printf("Database opened successfully at %s", dbPath)

	router := gin.Default()

	router.GET("/phrase/:phrase", getAddress)
	router.POST("/phrase", addAddress)

	serverAddr := "localhost:8080"
	log.Printf("Starting server on %s", serverAddr)
	if err := router.Run(serverAddr); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}

package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"go.mills.io/bitcask/v2"
	"gopkg.in/validator.v2"
)

var (
	db              *bitcask.Bitcask
	requestsPerHour = 100
	rateLimit       = make(map[string]int)
	lastRequestTime = make(map[string]time.Time)
)

type address_item struct {
	Phrase string `json:"phrase" validate:"nonzero"`
	Maddr  string `json:"maddr" validate:"nonzero"`
}

func validatePhrase(phrase string) bool {
	re := regexp.MustCompile(`^([0-9]|[1-9][0-9]|100)-[a-z]{3,8}-[a-z]{3,8}$`)
	return re.MatchString(phrase)
}

func rateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now()

		if lastRequestTime[ip] != (time.Time{}) && now.Sub(lastRequestTime[ip]) < time.Hour {
			requestsPerHour := rateLimit[ip]
			if requestsPerHour >= 100 {
				c.IndentedJSON(http.StatusTooManyRequests, gin.H{"message": "Rate limit exceeded"})
				return
			}
			rateLimit[ip]++
		} else {
			rateLimit[ip] = 1
			lastRequestTime[ip] = now
		}

		c.Next()
	}
}

func getAddress(c *gin.Context) {
	dbKeyString := c.Param("phrase")
	if !validatePhrase(dbKeyString) {
		c.IndentedJSON(http.StatusBadRequest, gin.H{"message": "Invalid phrase format"})
		return
	}

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
		log.Printf("Error binding JSON: %v", err)
		c.IndentedJSON(http.StatusBadRequest, gin.H{"message": "Invalid JSON payload", "details": err.Error()})
		return
	}

	if !validatePhrase(newAddress.Phrase) {
		c.IndentedJSON(http.StatusBadRequest, gin.H{"message": "Invalid phrase format"})
		return
	}

	if err := validator.Validate(newAddress); err != nil {
		log.Printf("Validation error for new address: %v", err)
		c.IndentedJSON(http.StatusBadRequest, gin.H{"message": "Validation failed", "errors": err})
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
	exePath, err := os.Executable()
	if err != nil {
		log.Fatalf("Failed to get executable path: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	dbName := "passphrase_database"
	dbPath := filepath.Join(exeDir, dbName)

	if _, err := os.Stat(dbPath); err == nil {
		log.Printf("Existing database found at %s. Deleting...", dbPath)
		if err := os.RemoveAll(dbPath); err != nil {
			log.Fatalf("Failed to delete existing database at %s: %v", dbPath, err)
		}
		log.Printf("Database deleted successfully.")
	} else if !os.IsNotExist(err) {
		log.Fatalf("Error checking database path %s: %v", dbPath, err)
	}

	db, err = bitcask.Open(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database at %s: %v", dbPath, err)
	}
	defer func() {
		log.Println("Closing database...")
		if err := db.Close(); err != nil {
			log.Printf("Error closing database: %v", err)
		}
	}()

	log.Printf("Database opened successfully at %s", dbPath)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(gin.Logger())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"https://fileferry.xyz"},
		AllowMethods:     []string{"GET", "POST"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           1 * time.Hour,
	}))

	router.Use(rateLimitMiddleware())
	router.GET("/phrase/:phrase", getAddress)
	router.POST("/phrase", addAddress)

	serverHost := os.Getenv("SERVER_HOST")
	serverPort := os.Getenv("SERVER_PORT")
	if serverPort == "" {
		serverPort = "8080"
	}
	serverAddr := serverHost + ":" + serverPort

	log.Printf("Starting server on %s", serverAddr)
	srv := &http.Server{
		Addr:         serverAddr,
		Handler:      router,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Failed to run server: %v", err)
	}
}

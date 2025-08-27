#!/bin/bash

# E2E Test Runner Script for Certificate Authority Management System
# This script provides comprehensive E2E testing with different configurations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_DIR="./e2e"
REPORTS_DIR="./test-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."

    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi

    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi

    # Check if Playwright is installed
    if ! npx playwright --version &> /dev/null; then
        print_warning "Playwright is not installed. Installing now..."
        npx playwright install
    fi

    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        print_warning "Dependencies not installed. Installing now..."
        npm install
    fi

    print_success "Prerequisites check completed!"
}

# Function to setup test environment
setup_test_environment() {
    print_status "Setting up test environment..."

    # Create reports directory
    mkdir -p "$REPORTS_DIR"

    # Set test environment variables
    export NODE_ENV=test
    export DATABASE_URL="file:./test.db"

    # Setup test database
    print_status "Setting up test database..."
    npx prisma db push --force-reset --schema=./prisma/schema.sqlite

    print_success "Test environment setup completed!"
}

# Function to run specific test suite
run_test_suite() {
    local suite_name=$1
    local test_file=$2
    local report_file="$REPORTS_DIR/${suite_name}_${TIMESTAMP}.html"

    print_status "Running $suite_name test suite..."

    if npx playwright test "$test_file" --reporter=html --output="$report_file"; then
        print_success "$suite_name test suite completed successfully!"
        print_status "Report saved to: $report_file"
        return 0
    else
        print_error "$suite_name test suite failed!"
        return 1
    fi
}

# Function to run all tests
run_all_tests() {
    local report_file="$REPORTS_DIR/all_tests_${TIMESTAMP}.html"

    print_status "Running all E2E tests..."

    if npx playwright test --reporter=html --output="$report_file"; then
        print_success "All E2E tests completed successfully!"
        print_status "Report saved to: $report_file"
        return 0
    else
        print_error "Some E2E tests failed!"
        return 1
    fi
}

# Function to run tests with specific browser
run_tests_with_browser() {
    local browser=$1
    local report_file="$REPORTS_DIR/${browser}_tests_${TIMESTAMP}.html"

    print_status "Running E2E tests with $browser browser..."

    if npx playwright test --project="$browser" --reporter=html --output="$report_file"; then
        print_success "$browser browser tests completed successfully!"
        print_status "Report saved to: $report_file"
        return 0
    else
        print_error "$browser browser tests failed!"
        return 1
    fi
}

# Function to run tests in headed mode (for debugging)
run_tests_headed() {
    local report_file="$REPORTS_DIR/headed_tests_${TIMESTAMP}.html"

    print_status "Running E2E tests in headed mode..."

    if npx playwright test --headed --reporter=html --output="$report_file"; then
        print_success "Headed mode tests completed successfully!"
        print_status "Report saved to: $report_file"
        return 0
    else
        print_error "Headed mode tests failed!"
        return 1
    fi
}

# Function to run tests with video recording
run_tests_with_video() {
    local report_file="$REPORTS_DIR/video_tests_${TIMESTAMP}.html"

    print_status "Running E2E tests with video recording..."

    if npx playwright test --video=on --reporter=html --output="$report_file"; then
        print_success "Video recording tests completed successfully!"
        print_status "Report saved to: $report_file"
        return 0
    else
        print_error "Video recording tests failed!"
        return 1
    fi
}

# Function to run tests with trace recording
run_tests_with_trace() {
    local report_file="$REPORTS_DIR/trace_tests_${TIMESTAMP}.html"

    print_status "Running E2E tests with trace recording..."

    if npx playwright test --trace=on --reporter=html --output="$report_file"; then
        print_success "Trace recording tests completed successfully!"
        print_status "Report saved to: $report_file"
        return 0
    else
        print_error "Trace recording tests failed!"
        return 1
    fi
}

# Function to run visual regression tests
run_visual_regression_tests() {
    local report_file="$REPORTS_DIR/visual_regression_${TIMESTAMP}.html"

    print_status "Running visual regression tests..."

    if npx playwright test visual-regression.spec.ts --reporter=html --output="$report_file"; then
        print_success "Visual regression tests completed successfully!"
        print_status "Report saved to: $report_file"
        return 0
    else
        print_error "Visual regression tests failed!"
        return 1
    fi
}

# Function to run accessibility tests
run_accessibility_tests() {
    local report_file="$REPORTS_DIR/accessibility_${TIMESTAMP}.html"

    print_status "Running accessibility tests..."

    if npx playwright test accessibility.spec.ts --reporter=html --output="$report_file"; then
        print_success "Accessibility tests completed successfully!"
        print_status "Report saved to: $report_file"
        return 0
    else
        print_error "Accessibility tests failed!"
        return 1
    fi
}

# Function to run performance tests
run_performance_tests() {
    local report_file="$REPORTS_DIR/performance_${TIMESTAMP}.html"

    print_status "Running performance tests..."

    if npx playwright test performance.spec.ts --reporter=html --output="$report_file"; then
        print_success "Performance tests completed successfully!"
        print_status "Report saved to: $report_file"
        return 0
    else
        print_error "Performance tests failed!"
        return 1
    fi
}

# Function to run comprehensive test suite
run_comprehensive_tests() {
    print_status "Running comprehensive test suite..."

    local success_count=0
    local total_count=0

    # Run all test suites
    local test_suites=(
        "auth-flow.spec.ts:Authentication"
        "dashboard-navigation.spec.ts:Dashboard"
        "certificate-management.spec.ts:Certificates"
        "ca-management.spec.ts:CA Management"
        "performance-security.spec.ts:Security"
        "certificate-lifecycle.spec.ts:Lifecycle"
        "visual-regression.spec.ts:Visual Regression"
        "accessibility.spec.ts:Accessibility"
        "performance.spec.ts:Performance"
    )

    for test_suite in "${test_suites[@]}"; do
        IFS=':' read -r test_file suite_name <<< "$test_suite"
        total_count=$((total_count + 1))

        print_status "Running $suite_name tests..."
        if npx playwright test "$test_file" --reporter=html --output="$REPORTS_DIR/${suite_name}_${TIMESTAMP}.html"; then
            print_success "$suite_name tests passed!"
            success_count=$((success_count + 1))
        else
            print_error "$suite_name tests failed!"
        fi
    done

    print_status "Comprehensive test results: $success_count/$total_count suites passed"

    if [ $success_count -eq $total_count ]; then
        print_success "All test suites passed!"
        return 0
    else
        print_error "Some test suites failed!"
        return 1
    fi
}

# Function to show test results summary
show_test_summary() {
    print_status "Test Results Summary:"
    echo "========================"

    # Count test files
    local test_count=$(find "$TEST_DIR" -name "*.spec.ts" | wc -l)
    echo "Total test suites: $test_count"

    # List test files
    echo "Test suites found:"
    find "$TEST_DIR" -name "*.spec.ts" -exec basename {} \; | sort

    # Show recent reports
    echo ""
    echo "Recent test reports:"
    find "$REPORTS_DIR" -name "*.html" -type f -exec basename {} \; | sort -r | head -5

    echo ""
    echo "To view a report, open: $REPORTS_DIR/[report_name].html"
}

# Function to clean up test artifacts
cleanup_test_artifacts() {
    print_status "Cleaning up test artifacts..."

    # Remove test database
    if [ -f "test.db" ]; then
        rm test.db
        print_status "Removed test database"
    fi

    # Remove test reports older than 7 days
    find "$REPORTS_DIR" -name "*.html" -type f -mtime +7 -delete
    print_status "Cleaned up old test reports"

    print_success "Cleanup completed!"
}

# Function to show help
show_help() {
    echo "E2E Test Runner for Certificate Authority Management System"
    echo ""
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  all                    Run all E2E tests"
    echo "  comprehensive          Run comprehensive test suite with all test types"
    echo "  auth                   Run authentication tests only"
    echo "  dashboard              Run dashboard tests only"
    echo "  certificates           Run certificate management tests only"
    echo "  ca                     Run CA management tests only"
    echo "  security               Run security and performance tests only"
    echo "  lifecycle              Run certificate lifecycle tests only"
    echo "  visual                 Run visual regression tests only"
    echo "  accessibility          Run accessibility tests only"
    echo "  performance            Run performance tests only"
    echo "  browser [browser]      Run tests with specific browser (chromium, firefox, webkit)"
    echo "  headed                 Run tests in headed mode (for debugging)"
    echo "  video                  Run tests with video recording"
    echo "  trace                  Run tests with trace recording"
    echo "  setup                  Setup test environment only"
    echo "  cleanup                Clean up test artifacts"
    echo "  summary                Show test results summary"
    echo "  help                   Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 all                 # Run all tests"
    echo "  $0 comprehensive       # Run comprehensive test suite"
    echo "  $0 visual              # Run visual regression tests"
    echo "  $0 accessibility       # Run accessibility tests"
    echo "  $0 performance         # Run performance tests"
    echo "  $0 browser chromium    # Run tests with Chromium browser"
    echo "  $0 headed              # Run tests in headed mode"
    echo "  $0 setup               # Setup test environment"
    echo ""
}

# Main script logic
main() {
    case "${1:-help}" in
        "all")
            check_prerequisites
            setup_test_environment
            run_all_tests
            ;;
        "comprehensive")
            check_prerequisites
            setup_test_environment
            run_comprehensive_tests
            ;;
        "auth")
            check_prerequisites
            setup_test_environment
            run_test_suite "Authentication" "$TEST_DIR/auth-flow.spec.ts"
            ;;
        "dashboard")
            check_prerequisites
            setup_test_environment
            run_test_suite "Dashboard" "$TEST_DIR/dashboard-navigation.spec.ts"
            ;;
        "certificates")
            check_prerequisites
            setup_test_environment
            run_test_suite "Certificates" "$TEST_DIR/certificate-management.spec.ts"
            ;;
        "ca")
            check_prerequisites
            setup_test_environment
            run_test_suite "CA Management" "$TEST_DIR/ca-management.spec.ts"
            ;;
        "security")
            check_prerequisites
            setup_test_environment
            run_test_suite "Security" "$TEST_DIR/performance-security.spec.ts"
            ;;
        "lifecycle")
            check_prerequisites
            setup_test_environment
            run_test_suite "Lifecycle" "$TEST_DIR/certificate-lifecycle.spec.ts"
            ;;
        "visual")
            check_prerequisites
            setup_test_environment
            run_visual_regression_tests
            ;;
        "accessibility")
            check_prerequisites
            setup_test_environment
            run_accessibility_tests
            ;;
        "performance")
            check_prerequisites
            setup_test_environment
            run_performance_tests
            ;;
        "browser")
            if [ -z "$2" ]; then
                print_error "Please specify a browser (chromium, firefox, webkit)"
                exit 1
            fi
            check_prerequisites
            setup_test_environment
            run_tests_with_browser "$2"
            ;;
        "headed")
            check_prerequisites
            setup_test_environment
            run_tests_headed
            ;;
        "video")
            check_prerequisites
            setup_test_environment
            run_tests_with_video
            ;;
        "trace")
            check_prerequisites
            setup_test_environment
            run_tests_with_trace
            ;;
        "setup")
            check_prerequisites
            setup_test_environment
            ;;
        "cleanup")
            cleanup_test_artifacts
            ;;
        "summary")
            show_test_summary
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# Run main function with all arguments
main "$@"